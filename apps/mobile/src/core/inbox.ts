// ── Regras da caixa de entrada e da navegação ─────────────────────────────────
// PURO, sem React Native: é o que permite testar navegação e filtros sem
// simulador. As telas importam daqui; nada de duplicar regra na UI.

import type { ConversationRow, Me } from "./contracts";

/** Módulos da barra inferior, na ordem de exibição. */
export type ModuloRota = "conversas" | "anuncios" | "funil" | "revisao";

/**
 * Quais MÓDULOS este tenant/usuário enxerga.
 *
 * Derivado de `sections` + `quotesEnabled` do /me — nunca de nome de cliente.
 * Conversas e Mais são sempre visíveis: a primeira é a seção obrigatória do
 * portal, a segunda é o escape para o resto do produto.
 */
export function modulosPara(me: Me | null): ModuloRota[] {
  const secoes = me?.sections ?? [];
  const out: ModuloRota[] = ["conversas"];
  // Cada módulo aparece só para o tenant que tem a seção. Isto deixou de ser
  // só estética quando o servidor passou a RECUSAR a rota correspondente
  // (PORTAL_SECTION_ENFORCE): mostrar um módulo sem seção viraria um 403 na
  // cara do usuário.
  if (secoes.includes("anuncios")) out.push("anuncios");
  if (secoes.includes("funil")) out.push("funil");
  // Orçamentos exige a seção E a funcionalidade ligada no cliente. Fechamento
  // NÃO é um destino próprio: vive como segmento dentro desta mesma tela, que é
  // o mesmo assunto — e assim não consome um espaço da barra.
  const temRevisao = secoes.includes("revisao") && me?.quotesEnabled === true;
  if (temRevisao || secoes.includes("fechamento")) out.push("revisao");
  // "Mais" NÃO entra aqui: virou atalho no cabeçalho. A barra é só para o que
  // se usa o dia inteiro.
  //
  // PENDENTE: o PWA já deixa Equipe entrar na barra quando o cliente tem poucas
  // seções (Jardim do Lago: WhatsApp, Funil e acompanhamento — acompanhar é o
  // trabalho inteiro das gerentes). Aqui a tela existe, mas fora das abas: para
  // acompanhar o portal, `app/equipe.tsx` precisa virar uma rota de `(app)`.
  // Ver `lib/portal/modulos.ts` no portal.
  return out;
}

// ── Filtros da caixa de entrada ───────────────────────────────────────────────

export type Filtro = "todas" | "aguardando" | "minhas" | "arquivadas";

/**
 * "Aguardando resposta": a última mensagem foi do LEAD e ninguém respondeu.
 * Mesma regra do portal (`isWaiting`) — não foi reinterpretada.
 */
export const aguardandoResposta = (c: ConversationRow): boolean =>
  c.lastDirection != null && c.lastDirection !== "out";

/** Rótulo da campanha do lead — mesma chave de agrupamento do portal. */
export const campanhaDe = (c: ConversationRow): string =>
  (c.adModel || c.adTitle || "Sem identificação").trim();

/**
 * Campanhas presentes na lista carregada, ordenadas por nome.
 *
 * SEM CONTAGEM de propósito: o backend não agrega por campanha, e contar só o
 * que foi paginado produziria um total falso — o defeito dos chips do portal.
 */
export function campanhasDe(linhas: ConversationRow[]): string[] {
  const set = new Set<string>();
  for (const c of linhas) if (c.fromAd) set.add(campanhaDe(c));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Campanhas com quantos leads cada uma trouxe, da maior para a menor. */
export function campanhasContadas(linhas: ConversationRow[]): { nome: string; total: number }[] {
  const conta = new Map<string, number>();
  for (const c of linhas) if (c.fromAd) conta.set(campanhaDe(c), (conta.get(campanhaDe(c)) ?? 0) + 1);
  return [...conta.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Filtro local da lista. "minhas" NÃO entra aqui: é filtro de SERVIDOR
 * (`owner=me`), como no portal — a lista já chega restrita.
 */
export function filtrarConversas(
  linhas: ConversationRow[],
  filtro: Filtro,
  campanha: string | null,
): ConversationRow[] {
  return linhas.filter((c) => {
    if (filtro === "aguardando" && !aguardandoResposta(c)) return false;
    if (campanha && (!c.fromAd || campanhaDe(c) !== campanha)) return false;
    return true;
  });
}
