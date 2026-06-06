import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { KommoConnection } from "@prisma/client";

// ── Kommo CRM API client (v4) ────────────────────────────────────────────────
// Docs: https://www.kommo.com/developers/
// Autenticação: Bearer token (token de longa duração ou OAuth2 access token).
// Base URL derivada do subdomínio: https://{subdomain}.kommo.com

export class KommoError extends Error {
  status: number;
  reconnect: boolean;
  constructor(message: string, status: number, reconnect = false) {
    super(message);
    this.status = status;
    this.reconnect = reconnect;
  }
}

function baseUrl(subdomain: string) {
  return `https://${subdomain}.kommo.com`;
}

// Garante um access token válido. Token de longa duração (expiresAt null) é
// devolvido direto; no fluxo OAuth2, renova automaticamente quando perto de expirar.
export async function getAccessToken(conn: KommoConnection): Promise<string> {
  const access = decryptSecret(conn.accessToken);

  const isOAuth = !!conn.refreshToken && !!conn.expiresAt;
  if (!isOAuth) return access;

  const expiresSoon = conn.expiresAt!.getTime() - Date.now() < 5 * 60 * 1000;
  if (!expiresSoon) return access;

  // Renova via OAuth2
  const res = await fetch(`${baseUrl(conn.subdomain)}/oauth2/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: decryptSecret(conn.oauthClientId ?? ""),
      client_secret: decryptSecret(conn.oauthSecret ?? ""),
      grant_type: "refresh_token",
      refresh_token: decryptSecret(conn.refreshToken!),
      redirect_uri: process.env.KOMMO_REDIRECT_URI ?? "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new KommoError("Não foi possível renovar o token do Kommo. Reconecte a conta.", 401, true);
  }

  await prisma.kommoConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: encryptSecret(data.access_token),
      refreshToken: encryptSecret(data.refresh_token),
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data.access_token;
}

// GET autenticado. `path` começa com "/api/v4/...".
export async function kommoGet<T = unknown>(
  conn: KommoConnection,
  token: string,
  path: string,
): Promise<T | null> {
  const res = await fetch(`${baseUrl(conn.subdomain)}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  // 204 = sem conteúdo (ex: filtro sem resultados)
  if (res.status === 204) return null;

  if (res.status === 401) {
    throw new KommoError("Token do Kommo inválido ou expirado. Reconecte a conta.", 401, true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new KommoError(body?.detail ?? body?.title ?? `Erro Kommo (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

// Verifica a conta (usado ao salvar a conexão). Retorna o nome da conta.
export async function verifyAccount(subdomain: string, token: string): Promise<string> {
  const res = await fetch(`${baseUrl(subdomain)}/api/v4/account`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new KommoError("Token inválido para esse domínio.", 401);
  if (!res.ok) throw new KommoError(`Não foi possível conectar (${res.status}).`, res.status);
  const data = (await res.json()) as { name?: string };
  return data.name ?? subdomain;
}

// ── Tags ─────────────────────────────────────────────────────────────────────
interface KommoTag { id: number; name: string }

// Mapa nome→id de todas as tags de lead. O filtro de leads usa o ID, não o nome.
export async function getLeadTags(conn: KommoConnection, token: string): Promise<KommoTag[]> {
  const out: KommoTag[] = [];
  let page = 1;
  for (;;) {
    const data = await kommoGet<{ _embedded?: { tags?: KommoTag[] } }>(
      conn, token, `/api/v4/leads/tags?page=${page}&limit=250`,
    );
    const tags = data?._embedded?.tags ?? [];
    out.push(...tags.map((t) => ({ id: t.id, name: t.name })));
    if (tags.length < 250) break;
    page++;
  }
  return out;
}

// ── Pipelines / status ───────────────────────────────────────────────────────
export interface StatusInfo { statusName: string; pipelineId: number; pipelineName: string }

export async function getStatusMap(conn: KommoConnection, token: string): Promise<Map<number, StatusInfo>> {
  const map = new Map<number, StatusInfo>();
  const data = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; name: string; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>(conn, token, `/api/v4/leads/pipelines`);
  for (const p of data?._embedded?.pipelines ?? []) {
    for (const s of p._embedded?.statuses ?? []) {
      map.set(s.id, { statusName: s.name, pipelineId: p.id, pipelineName: p.name });
    }
  }
  return map;
}

// ── Leads ──────────────────────────────────────────────────────────────────────
export interface RawLead {
  id: number;
  name: string | null;
  price: number | null;
  status_id: number | null;
  pipeline_id: number | null;
  created_at: number;
  updated_at: number;
  _embedded?: {
    tags?: KommoTag[];
    contacts?: Array<{ id: number; is_main?: boolean }>;
  };
}

interface LeadsFilter {
  tagIds?: number[];
  from?: number; // unix seconds
  to?: number;   // unix seconds
}

// Busca paginada de leads com filtro por tag e por data de criação.
export async function getLeads(conn: KommoConnection, token: string, filter: LeadsFilter): Promise<RawLead[]> {
  const out: RawLead[] = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams();
    params.set("with", "contacts");
    params.set("page", String(page));
    params.set("limit", "250");
    if (filter.from) params.set("filter[created_at][from]", String(filter.from));
    if (filter.to) params.set("filter[created_at][to]", String(filter.to));
    let qs = params.toString();
    // filter[tags][] precisa repetir a chave por id
    for (const id of filter.tagIds ?? []) qs += `&filter[tags][]=${id}`;

    const data = await kommoGet<{ _embedded?: { leads?: RawLead[] } }>(conn, token, `/api/v4/leads?${qs}`);
    const leads = data?._embedded?.leads ?? [];
    out.push(...leads);
    if (leads.length < 250) break;
    page++;
  }
  return out;
}

// ── Notas / conversa do lead ─────────────────────────────────────────────────
export interface LeadNote {
  id: number;
  type: string;
  text: string | null;
  incoming: boolean | null; // true=recebida, false=enviada, null=evento/sistema
  createdAt: number;        // unix seconds
  author: string | null;
}

// Extrai um texto legível dos params heterogêneos das notas do Kommo.
function noteText(noteType: string, params: Record<string, unknown> | null | undefined): string | null {
  if (!params) return null;
  const p = params as Record<string, string | undefined>;
  // Mensagens de chat/whatsapp normalmente trazem o texto em "text"
  if (p.text) return p.text;
  // Chamadas
  if (noteType.startsWith("call")) {
    const dur = p.duration ? ` (${p.duration}s)` : "";
    return `Ligação${p.phone ? ` ${p.phone}` : ""}${dur}`;
  }
  if (p.service) return p.service;
  return null;
}

// Lê a timeline de notas do lead (mensagens registradas + eventos expostos pela API).
export async function getLeadNotes(conn: KommoConnection, token: string, leadId: number): Promise<LeadNote[]> {
  const out: LeadNote[] = [];
  let page = 1;
  for (;;) {
    const data = await kommoGet<{
      _embedded?: { notes?: Array<{
        id: number; note_type: string; created_at: number; created_by?: number;
        params?: Record<string, unknown> | null;
      }> };
    }>(conn, token, `/api/v4/leads/${leadId}/notes?page=${page}&limit=250&order[created_at]=asc`);

    const notes = data?._embedded?.notes ?? [];
    for (const n of notes) {
      const p = (n.params ?? {}) as Record<string, unknown>;
      // Heurística de direção: alguns tipos trazem "income"/"in" booleano
      const inc = typeof p.income === "boolean" ? (p.income as boolean)
        : n.note_type.includes("_in") ? true
        : n.note_type.includes("_out") ? false
        : null;
      out.push({
        id: n.id,
        type: n.note_type,
        text: noteText(n.note_type, n.params),
        incoming: inc,
        createdAt: n.created_at,
        author: (p.author as { name?: string } | undefined)?.name ?? null,
      });
    }
    if (notes.length < 250) break;
    page++;
  }
  return out;
}

// ── Contatos (telefone) ──────────────────────────────────────────────────────
// O telefone vive como custom field do contato, não do lead. Busca em lote.
export async function getContactPhones(
  conn: KommoConnection,
  token: string,
  contactIds: number[],
): Promise<Map<number, { name: string | null; phone: string | null }>> {
  const map = new Map<number, { name: string | null; phone: string | null }>();
  const unique = [...new Set(contactIds)];

  // Kommo aceita filter[id][] múltiplo; pagina em lotes de 250.
  for (let i = 0; i < unique.length; i += 250) {
    const batch = unique.slice(i, i + 250);
    let qs = "limit=250";
    for (const id of batch) qs += `&filter[id][]=${id}`;

    const data = await kommoGet<{
      _embedded?: { contacts?: Array<{
        id: number; name: string | null;
        custom_fields_values?: Array<{ field_code?: string; values?: Array<{ value: string }> }> | null;
      }> };
    }>(conn, token, `/api/v4/contacts?${qs}`);

    for (const c of data?._embedded?.contacts ?? []) {
      const phoneField = c.custom_fields_values?.find((f) => f.field_code === "PHONE");
      const phone = phoneField?.values?.[0]?.value ?? null;
      map.set(c.id, { name: c.name ?? null, phone });
    }
  }
  return map;
}
