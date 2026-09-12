import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Cobertura do recorte por gerente ─────────────────────────────────────────
// Eu mesmo escrevi, ao construir isto: "um recorte que cada rota precisa lembrar
// de aplicar é um vazamento esperando acontecer". E então apliquei rota a rota —
// e esqueci duas (`hot-leads` e `state`), achadas só numa revisão posterior.
//
// Este teste faz a varredura que a revisão humana não faz de forma confiável:
// toda rota do portal que lê dados presos a um NÚMERO precisa ou aplicar o
// recorte, ou estar aqui embaixo com o motivo de não precisar.

const PORTAL = join(process.cwd(), "app", "api", "portal", "[token]");

/** Modelos cujo dado pertence a um número específico, não ao cliente. */
const POR_NUMERO = /waContact|waConversation|waMessage|waLead\b/;

// Isentas, cada uma com o porquê — a lista é o contrato, e crescer sem querer
// é o risco que o teste existe para pegar.
const ISENTAS: Record<string, string> = {
  // Só ESCREVEM. O gate barra quem acompanha antes de a rota rodar, então não há
  // leitura para recortar — e quem pode escrever (atendente, admin) trabalha na
  // caixa inteira do cliente por definição.
  "conversations/[contactId]/ai-reply/route.ts": "só escreve: manda a IA responder, e o gate barra quem acompanha",
  "conversations/[contactId]/correction/route.ts": "só escreve: aponta erro da IA, barrado para quem acompanha",
  "conversations/[contactId]/tags/route.ts": "só escreve: aplica e tira etiqueta, barrado para quem acompanha",
  "conversations/bulk-assign/route.ts": "só escreve, e ainda assim já filtra pelos números visíveis",
  "hot-leads/[contactId]/claim/route.ts": "só escreve: assume o lead, barrado para quem acompanha",

  // Dado do CLIENTE, não de um número. Orçamento pertence ao cliente e tem
  // contactId, não connectionId — recortar exigiria outra modelagem, e hoje
  // nenhum cliente com gerente tem a seção de orçamento ligada.
  "quotes/route.ts": "orçamento é do cliente, não de um número; não tem connectionId",
  "quotes/[quoteId]/pdf/route.ts": "o PDF de um orçamento do cliente, mesma razão da lista",
  "quote-reviews/route.ts": "fila de revisão é do cliente inteiro, mesma razão",
  "quote-reviews/[quoteId]/pdf/route.ts": "o PDF de um orçamento em revisão, mesma razão",
  "quote-reviews/[quoteId]/reject/route.ts": "escreve, e orçamento não é preso a número",
  "usage/route.ts": "consumo e plano são do cliente, não se dividem por número",
};

function rotas(dir: string, prefixo = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...rotas(full, `${prefixo}${e}/`));
    else if (e === "route.ts") out.push(`${prefixo}${e}`);
  }
  return out;
}

test("toda rota que lê dado de um NÚMERO respeita o recorte da gerente", () => {
  const sem: string[] = [];
  for (const rel of rotas(PORTAL)) {
    if (rel in ISENTAS) continue;
    const src = readFileSync(join(PORTAL, rel), "utf8");
    if (!POR_NUMERO.test(src)) continue;
    // Vale aplicar direto ou por um ajudante que já leva o recorte.
    const recorta = src.includes("conexoesVisiveis") || src.includes("conexaoDoContato");
    if (!recorta) sem.push(rel);
  }
  assert.deepEqual(sem, [],
    `rotas que leem dado de número sem recortar pela gerente:\n  - ${sem.join("\n  - ")}`);
});

test("nenhuma rota do portal ainda procura “a” conexão do cliente", () => {
  // `findFirst({ where: { clientId } })` é o padrão de quando havia UM número
  // por cliente. Sobrevivente dele responde "conversa não encontrada" para uma
  // conversa que está aberta na tela — foi o que aconteceu em `state`.
  const sobreviventes: string[] = [];
  for (const rel of rotas(PORTAL)) {
    const src = readFileSync(join(PORTAL, rel), "utf8");
    if (/waConnection\.findFirst\(\{\s*where:\s*\{\s*clientId:[^}]*\}\s*,?\s*(select|\})/.test(src)) {
      sobreviventes.push(rel);
    }
  }
  assert.deepEqual(sobreviventes, [],
    `ainda assumem um número por cliente:\n  - ${sobreviventes.join("\n  - ")}`);
});

test("a lista de isentas não cresce sozinha", () => {
  // Marcar uma rota como isenta é uma decisão; deixar de notar que a lista
  // cresceu é um acidente.
  assert.equal(Object.keys(ISENTAS).length, 11,
    "a lista de isentas mudou — confira se cada nova entrada tem motivo de verdade");
  for (const [rota, motivo] of Object.entries(ISENTAS)) {
    // "idem" não é motivo: daqui a seis meses ninguém sabe a que ele se referia.
    assert.ok(motivo.length > 25 && !/^idem/i.test(motivo),
      `a isenção de ${rota} precisa dizer POR QUÊ, por extenso`);
  }
});
