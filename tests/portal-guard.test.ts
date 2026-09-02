import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Regressão do achado A-01 ──────────────────────────────────────────────────
// A autorização do portal era decidida rota a rota e 11 rotas ficavam SÓ com o token
// (serviam histórico completo, mídia, PDF e até ações, mesmo com login exigido).
// Este teste faz a checagem que faltava ser automática: TODA rota de /api/portal/**
// precisa passar por `guardPortal` ou por uma checagem explícita de sessão.
//
// Rota nova sem gate quebra o teste — que é exatamente o ponto.

const PORTAL_API = join(process.cwd(), "app", "api", "portal", "[token]");

// Rotas legitimamente ANÔNIMAS (é onde a sessão é criada, ou dado público do PWA).
// Cada uma tem sua própria proteção, anotada aqui para a exceção ser consciente.
const ANONIMAS: Record<string, string> = {
  "auth/login/route.ts": "cria a sessão — protegida por cota de identidade e de IP",
  "auth/register/route.ts": "cria a conta — protegida por cota por IP + sem auto-promoção a admin",
  "auth/logout/route.ts": "destrói a própria sessão do cookie",
  "push/public-key/route.ts": "chave PÚBLICA VAPID (não é segredo)",
  "me/route.ts": "informa SE há sessão; devolve user=null quando não há",
};

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full, `${prefix}${entry}/`));
    else if (entry === "route.ts") out.push(`${prefix}${entry}`);
  }
  return out;
}

test("toda rota do portal tem gate de autorização", () => {
  const files = routeFiles(PORTAL_API);
  assert.ok(files.length >= 30, `esperava dezenas de rotas, achei ${files.length}`);

  const semGate: string[] = [];
  for (const rel of files) {
    if (rel in ANONIMAS) continue;
    const src = readFileSync(join(PORTAL_API, rel), "utf8");
    const temGuard = src.includes("guardPortal");
    const temChecagemExplicita = src.includes("isProtected") || src.includes("getPortalSessionEmail");
    if (!temGuard && !temChecagemExplicita) semGate.push(rel);
  }

  assert.deepEqual(semGate, [], `rotas do portal sem gate de sessão:\n  - ${semGate.join("\n  - ")}`);
});

test("rotas que EXECUTAM ação ou gastam modelo passam pelo gate central", () => {
  // Estas são as de maior impacto: enviam mensagem real ao lead, mudam estado
  // comercial ou consomem LLM. Aqui exigimos o guardPortal (não só uma checagem solta).
  const CRITICAS = [
    "conversations/[contactId]/ai-reply/route.ts",  // gera com o modelo E envia no WhatsApp
    "conversations/[contactId]/route.ts",           // histórico integral do lead
    "conversations/[contactId]/stream/route.ts",    // SSE: segura conexão e consulta o banco
    "conversations/[contactId]/media/[messageId]/route.ts",
    "conversations/route.ts",                       // base de leads do cliente
    "funnel/[contactId]/route.ts",                  // ESCRITA no funil
    "advisor/route.ts",                             // pergunta livre a um LLM
    "quotes/route.ts",
    "quotes/[quoteId]/pdf/route.ts",
    "tags/route.ts",
    "conversations/[contactId]/tags/route.ts",
    "creative/[creativeId]/video/route.ts",
    "badges/route.ts",
  ];
  for (const rel of CRITICAS) {
    const src = readFileSync(join(PORTAL_API, rel), "utf8");
    assert.ok(src.includes("guardPortal"), `${rel} não usa guardPortal`);
  }
});

test("nenhuma rota crítica resolve o token por fora do gate", () => {
  // resolvePortal sem gate foi a origem do problema: ele valida o TOKEN, não a SESSÃO.
  const files = routeFiles(PORTAL_API);
  const suspeitas: string[] = [];
  for (const rel of files) {
    if (rel in ANONIMAS) continue;
    const src = readFileSync(join(PORTAL_API, rel), "utf8");
    if (src.includes("resolvePortal") && !src.includes("guardPortal") && !src.includes("isProtected")) {
      suspeitas.push(rel);
    }
  }
  assert.deepEqual(suspeitas, [], `usam resolvePortal sem gate:\n  - ${suspeitas.join("\n  - ")}`);
});
