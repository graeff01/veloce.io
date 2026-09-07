// ── Contratos da API do portal ────────────────────────────────────────────────
// Espelham as respostas REAIS das rotas em app/api/portal/[token]/**. Os parsers
// existem para que uma mudança de contrato no backend apareça como erro claro no
// app (e como teste vermelho no CI), em vez de virar `undefined` numa tela.
//
// Princípio: o app não recalcula regra. `windowOpen`, `funnelStage`, `assignedName`
// e afins chegam decididos pelo servidor e são apenas exibidos.

export type PortalSection =
  | "painel" | "revisao" | "fechamento" | "conversas" | "aprendizado" | "consumo"
  | "frete" | "equipe" | "anuncios" | "ia" | "funil" | "objecoes";

export interface Tag { id: string; name: string; color: string }
export interface Attendant { email: string; name: string }

export interface Brand {
  name: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  mode: string;
}

export interface Me {
  user: { email: string; name: string | null; role: string } | null;
  requireLogin: boolean;
  sections: PortalSection[];
  aiTest: boolean;
  quotesEnabled: boolean;
  brand: Brand;
}

export interface ConversationRow {
  contactId: string;
  name: string;
  waId: string;
  lastText: string | null;
  lastType: string | null;
  lastDirection: string | null;
  lastMessageAt: string | null;
  fromAd: boolean;
  adStrong: boolean;
  adTitle: string | null;
  adModel: string | null;
  funnelStage: string | null;
  assignedEmail: string | null;
  assignedName: string | null;
  tags: Tag[];
  /** Quando o lead falou e quando respondemos — alimenta "aguardando há". */
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  /** Estado COMPARTILHADO pela equipe — não é preferência do aparelho. */
  lida: boolean;
  lidaPor: string | null;
  arquivada: boolean;
}

export interface ConversationList {
  conversations: ConversationRow[];
  me: string | null;
  meName: string | null;
  isAdmin: boolean;
  hasMore: boolean;
  attendants: Attendant[];
}

export interface Message {
  id: string;
  text: string | null;
  direction: string;
  type: string;
  timestamp: string;
  aiGenerated: boolean;
  sentByName: string | null;
  transcription: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  reaction: string | null;
}

export interface LeadOrigin {
  adTitle: string | null;
  adModel: string | null;
  adBody: string | null;
  sourceUrl: string | null;
  image: string | null;
  adStrong: boolean;
}

export interface Conversation {
  contact: { name: string };
  lead: LeadOrigin | null;
  funnelStage: string | null;
  funnelEvidence: string | null;
  /** Janela de 24h do WhatsApp — decidida pelo SERVIDOR. O app só respeita. */
  windowOpen: boolean;
  lastInboundAt: string | null;
  assignedEmail: string | null;
  assignedName: string | null;
  me: string | null;
  meName: string | null;
  attendants: Attendant[];
  tags: Tag[];
  items: Message[];
}

export interface QuoteLine { label: string; amount: number }

/** Espelha `reviews[]` de app/api/portal/[token]/quote-reviews/route.ts. */
export interface QuoteReview {
  quoteId: string;
  /** Sequencial por cliente. É Int no banco (Quote.number), não texto. */
  number: number | null;
  contactId: string | null;
  /** Nome do lead já resolvido pelo servidor (displayName → name → waId). */
  name: string;
  total: number | null;
  currency: string;
  summary: string | null;
  /** "instalação: … · opcionais: …" — montado no servidor a partir do intake. */
  resumo: string | null;
  city: string | null;
  lines: QuoteLine[];
  submittedAt: string | null;
}

/** Desempenho de mídia (módulo Anúncios). Espelha ClientAds de lib/notifications/client-ads.ts. */
export interface AdsCampaign {
  name: string; spend: number; leads: number; cpl: number | null; pctSpend: number;
  /** Thumbnail de um criativo da campanha. null quando o anúncio não tem peça. */
  image: string | null;
}
export interface AdsPerformance {
  hasMeta: boolean;
  periodLabel: string;
  currency: string;
  spend: number;
  leads: number;
  cpl: number | null;
  deltas: { spend: number | null; leads: number | null; cpl: number | null };
  topCampaigns: AdsCampaign[];
  /** Gasto e leads por dia do período — alimenta a linha de evolução. */
  series: { day: string; spend: number; leads: number }[];
}

// ── Parsers ───────────────────────────────────────────────────────────────────

export class ContractError extends Error {
  constructor(what: string) {
    super(`Resposta inesperada da API: ${what}`);
    this.name = "ContractError";
  }
}

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ContractError(what);
  return v as Record<string, unknown>;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean => v === true;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Datas chegam como ISO (Prisma serializa Date). Mantidas como string. */
const iso = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
};

function parseTag(v: unknown): Tag | null {
  const t = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  const id = t ? str(t.id) : null;
  const name = t ? str(t.name) : null;
  if (!id || !name) return null;
  return { id, name, color: (t && str(t.color)) || "#64748B" };
}

export const parseTags = (v: unknown): Tag[] => arr(v).map(parseTag).filter((t): t is Tag => t !== null);

function parseAttendant(v: unknown): Attendant | null {
  const a = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  const email = a ? str(a.email) : null;
  if (!email) return null;
  return { email, name: (a && str(a.name)) || email.split("@")[0] || email };
}

const parseAttendants = (v: unknown): Attendant[] =>
  arr(v).map(parseAttendant).filter((a): a is Attendant => a !== null);

const SECTIONS = new Set<string>([
  "painel", "revisao", "fechamento", "conversas", "aprendizado", "consumo",
  "frete", "equipe", "anuncios", "ia", "funil", "objecoes",
]);

export function parseMe(input: unknown): Me {
  const d = obj(input, "/me");
  const rawUser = d.user;
  let user: Me["user"] = null;
  if (rawUser && typeof rawUser === "object") {
    const u = rawUser as Record<string, unknown>;
    const email = str(u.email);
    if (email) user = { email, name: str(u.name), role: str(u.role) || "attendant" };
  }
  const b = d.brand && typeof d.brand === "object" ? (d.brand as Record<string, unknown>) : {};
  return {
    user,
    requireLogin: bool(d.requireLogin),
    // Seções desconhecidas são DESCARTADAS: se o backend inventar uma, o app não
    // renderiza um item de menu morto — e o servidor segue sendo a autorização real.
    sections: arr(d.sections).map(str).filter((s): s is PortalSection => s !== null && SECTIONS.has(s)),
    aiTest: bool(d.aiTest),
    quotesEnabled: bool(d.quotesEnabled),
    brand: {
      name: str(b.name),
      logoUrl: str(b.logoUrl),
      accentColor: str(b.accentColor),
      mode: str(b.mode) || "light",
    },
  };
}

export function parseConversationRow(input: unknown): ConversationRow {
  const d = obj(input, "conversa da lista");
  const contactId = str(d.contactId);
  if (!contactId) throw new ContractError("conversa sem contactId");
  return {
    contactId,
    name: str(d.name) || str(d.waId) || "Sem nome",
    waId: str(d.waId) || "",
    lastText: str(d.lastText),
    lastType: str(d.lastType),
    lastDirection: str(d.lastDirection),
    lastMessageAt: iso(d.lastMessageAt),
    fromAd: bool(d.fromAd),
    adStrong: bool(d.adStrong),
    adTitle: str(d.adTitle),
    adModel: str(d.adModel),
    funnelStage: str(d.funnelStage),
    assignedEmail: str(d.assignedEmail),
    assignedName: str(d.assignedName),
    tags: parseTags(d.tags),
    lastInboundAt: str(d.lastInboundAt) || null,
    lastOutboundAt: str(d.lastOutboundAt) || null,
    lida: bool(d.lida),
    lidaPor: str(d.lidaPor) || null,
    arquivada: bool(d.arquivada),
  };
}

export function parseConversationList(input: unknown): ConversationList {
  const d = obj(input, "lista de conversas");
  return {
    conversations: arr(d.conversations).map(parseConversationRow),
    me: str(d.me),
    meName: str(d.meName),
    isAdmin: bool(d.isAdmin),
    hasMore: bool(d.hasMore),
    attendants: parseAttendants(d.attendants),
  };
}

export function parseMessage(input: unknown): Message {
  const d = obj(input, "mensagem");
  const id = str(d.id);
  const timestamp = iso(d.timestamp);
  if (!id) throw new ContractError("mensagem sem id");
  if (!timestamp) throw new ContractError("mensagem sem timestamp válido");
  return {
    id,
    text: str(d.text),
    direction: str(d.direction) || "in",
    type: str(d.type) || "text",
    timestamp,
    aiGenerated: bool(d.aiGenerated),
    sentByName: str(d.sentByName),
    transcription: str(d.transcription),
    deliveredAt: iso(d.deliveredAt),
    readAt: iso(d.readAt),
    reaction: str(d.reaction),
  };
}

export function parseConversation(input: unknown): Conversation {
  const d = obj(input, "conversa");
  const contact = obj(d.contact, "contato da conversa");
  let lead: LeadOrigin | null = null;
  if (d.lead && typeof d.lead === "object") {
    const l = d.lead as Record<string, unknown>;
    lead = {
      adTitle: str(l.adTitle), adModel: str(l.adModel), adBody: str(l.adBody),
      sourceUrl: str(l.sourceUrl), image: str(l.image), adStrong: bool(l.adStrong),
    };
  }
  return {
    contact: { name: str(contact.name) || "Sem nome" },
    lead,
    funnelStage: str(d.funnelStage),
    funnelEvidence: str(d.funnelEvidence),
    // Ausência de `windowOpen` é tratada como FECHADA: na dúvida o app não deixa
    // enviar fora da janela de 24h. Fail-safe, nunca fail-open.
    windowOpen: bool(d.windowOpen),
    lastInboundAt: iso(d.lastInboundAt),
    assignedEmail: str(d.assignedEmail),
    assignedName: str(d.assignedName),
    me: str(d.me),
    meName: str(d.meName),
    attendants: parseAttendants(d.attendants),
    tags: parseTags(d.tags),
    items: arr(d.items).map(parseMessage),
  };
}

function parseQuoteLine(v: unknown): QuoteLine | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  const label = str(l.label);
  if (!label) return null;
  return { label, amount: num(l.amount) ?? 0 };
}

export function parseQuoteReviews(input: unknown): QuoteReview[] {
  const d = obj(input, "revisões de orçamento");
  return arr(d.reviews)
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const q = v as Record<string, unknown>;
      const quoteId = str(q.quoteId);
      if (!quoteId) return null;
      return {
        quoteId,
        number: num(q.number),
        contactId: str(q.contactId),
        name: str(q.name) || "Lead",
        total: num(q.total),
        currency: str(q.currency) || "BRL",
        summary: str(q.summary),
        resumo: str(q.resumo),
        city: str(q.city),
        lines: arr(q.lines).map(parseQuoteLine).filter((l): l is QuoteLine => l !== null),
        submittedAt: iso(q.submittedAt),
      } satisfies QuoteReview;
    })
    .filter((q): q is QuoteReview => q !== null);
}

export interface ItemCatalogo {
  id: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
  url: string | null;
}

export function parseCatalogo(input: unknown): ItemCatalogo[] {
  const d = obj(input, "catálogo");
  return arr(d.items)
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const c = v as Record<string, unknown>;
      const id = str(c.id), title = str(c.title);
      if (!id || !title) return null;
      return { id, title, price: num(c.price), imageUrl: str(c.imageUrl) || null, url: str(c.url) || null };
    })
    .filter((v): v is ItemCatalogo => v !== null);
}

export function parseAdsPerformance(input: unknown): AdsPerformance {
  const d = obj(input, "desempenho de anúncios");
  const del = d.deltas && typeof d.deltas === "object" ? (d.deltas as Record<string, unknown>) : {};
  return {
    hasMeta: bool(d.hasMeta),
    periodLabel: str(d.periodLabel) || "",
    currency: str(d.currency) || "BRL",
    spend: num(d.spend) ?? 0,
    leads: num(d.leads) ?? 0,
    cpl: num(d.cpl),
    deltas: { spend: num(del.spend), leads: num(del.leads), cpl: num(del.cpl) },
    series: arr(d.series)
      .map((v) => {
        if (!v || typeof v !== "object") return null;
        const p = v as Record<string, unknown>;
        const day = str(p.day);
        return day ? { day, spend: num(p.spend) ?? 0, leads: num(p.leads) ?? 0 } : null;
      })
      .filter((v): v is { day: string; spend: number; leads: number } => v !== null),
    topCampaigns: arr(d.topCampaigns)
      .map((v) => {
        if (!v || typeof v !== "object") return null;
        const c = v as Record<string, unknown>;
        const name = str(c.name);
        if (!name) return null;
        return {
          name,
          spend: num(c.spend) ?? 0,
          leads: num(c.leads) ?? 0,
          cpl: num(c.cpl),
          pctSpend: num(c.pctSpend) ?? 0,
          image: str(c.image),
        } satisfies AdsCampaign;
      })
      .filter((c): c is AdsCampaign => c !== null),
  };
}

// ── Fechamento (leads que aprovaram o orçamento) ──────────────────────────────
// A fila de quem já disse "quero fechar". É a tela oposta à lista de 1.271
// conversas: cinco linhas, ordenadas pela mais antiga, com SLA correndo.

export interface LeadFechamento {
  contactId: string;
  name: string;
  waId: string | null;
  approvedAt: string | null;
  quoteNumber: string | null;
  total: number | null;
  currency: string;
  resumo: string | null;
  city: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  mine: boolean;
}

export interface Fechamento {
  leads: LeadFechamento[];
  /** Quantos ainda não têm dono — é a urgência da tela. */
  unclaimed: number;
  me: string | null;
}

export function parseFechamento(input: unknown): Fechamento {
  const d = obj(input, "fila de fechamento");
  const leads = arr(d.leads)
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const l = v as Record<string, unknown>;
      const contactId = str(l.contactId);
      if (!contactId) return null;
      return {
        contactId,
        name: str(l.name) || "Lead",
        waId: str(l.waId),
        approvedAt: str(l.approvedAt),
        quoteNumber: str(l.quoteNumber),
        total: num(l.total),
        currency: str(l.currency) || "BRL",
        resumo: str(l.resumo),
        city: str(l.city),
        ownerEmail: str(l.ownerEmail),
        ownerName: str(l.ownerName),
        mine: bool(l.mine),
      };
    })
    .filter((v): v is LeadFechamento => v !== null);
  return { leads, unclaimed: num(d.unclaimed) ?? 0, me: str(d.me) };
}

// ── Equipe ────────────────────────────────────────────────────────────────────
// Três vendedoras no mesmo número: sem isto não dá para saber quem respondeu o
// quê. O servidor já decide o que cada papel enxerga — atendente vê só a própria
// linha, admin vê o time inteiro. O app só respeita.

export interface LinhaEquipe {
  email: string;
  name: string;
  isMe: boolean;
  newLeads: number;
  owned: number;
  waiting: number;
  qualified: number;
  converted: number;
  revenue: number;
  replies: number;
  avgFirstResponseSec: number | null;
}

export interface Equipe {
  me: string | null;
  isAdmin: boolean;
  periodLabel: string;
  rows: LinhaEquipe[];
  team: Omit<LinhaEquipe, "email" | "name" | "isMe" | "avgFirstResponseSec"> | null;
  unassigned: number;
}

export function parseEquipe(input: unknown): Equipe {
  const d = obj(input, "métricas da equipe");
  const linha = (v: unknown): LinhaEquipe | null => {
    if (!v || typeof v !== "object") return null;
    const r = v as Record<string, unknown>;
    const email = str(r.email);
    if (!email) return null;
    return {
      email,
      name: str(r.name) || email,
      isMe: bool(r.isMe),
      newLeads: num(r.newLeads) ?? 0,
      owned: num(r.owned) ?? 0,
      waiting: num(r.waiting) ?? 0,
      qualified: num(r.qualified) ?? 0,
      converted: num(r.converted) ?? 0,
      revenue: num(r.revenue) ?? 0,
      replies: num(r.replies) ?? 0,
      avgFirstResponseSec: num(r.avgFirstResponseSec),
    };
  };
  const t = d.team && typeof d.team === "object" ? (d.team as Record<string, unknown>) : null;
  return {
    me: str(d.me),
    isAdmin: bool(d.isAdmin),
    periodLabel: str(d.periodLabel) || "",
    rows: arr(d.rows).map(linha).filter((v): v is LinhaEquipe => v !== null),
    team: t ? {
      newLeads: num(t.newLeads) ?? 0, owned: num(t.owned) ?? 0, waiting: num(t.waiting) ?? 0,
      qualified: num(t.qualified) ?? 0, converted: num(t.converted) ?? 0,
      revenue: num(t.revenue) ?? 0, replies: num(t.replies) ?? 0,
    } : null,
    unassigned: num(d.unassigned) ?? 0,
  };
}
