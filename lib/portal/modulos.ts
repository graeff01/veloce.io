// ── Módulos da barra inferior (PWA no celular) ───────────────────────────────
// A barra lista MÓDULOS, não filtros. Filtros vivem dentro do módulo — foi a
// regra que definimos no aplicativo, e é o que evita a barra virar um painel de
// controle com sete botões.
//
// MESMA REGRA de `apps/mobile/src/core/inbox.ts` (modulosPara). Duplicada de
// propósito: o app é um projeto Expo com bundler próprio e não importa daqui.
// `tests/portal-modulos.test.ts` repete os casos do teste de lá — se as duas
// barras discordarem, a vendedora encontra um app e um site diferentes.

export type ModuloPortal = "conversas" | "anuncios" | "funil" | "revisao";

export interface ModuloInfo {
  chave: ModuloPortal;
  rotulo: string;
  /** Caminho a partir de /r/<token>. */
  caminho: string;
}

const CATALOGO: { chave: ModuloPortal; rotulo: string; caminho: string; secao: string | null }[] = [
  { chave: "conversas", rotulo: "Conversas", caminho: "/conversas", secao: null },
  { chave: "anuncios", rotulo: "Anúncios", caminho: "/anuncios", secao: "anuncios" },
  { chave: "funil", rotulo: "Funil", caminho: "/funil", secao: "funil" },
  { chave: "revisao", rotulo: "Orçamentos", caminho: "/revisao", secao: "revisao" },
];

/**
 * Quais módulos ESTE usuário enxerga.
 *
 * `sections` nulo = todas (cliente que nunca configurou). Conversas entra
 * sempre: é a seção obrigatória do portal.
 *
 * Orçamentos exige a seção E a funcionalidade ligada no cliente — mas aparece
 * também para quem tem só `fechamento`, porque a fila de fechamento mora dentro
 * dessa tela como segmento, e sem isso a pessoa não teria como chegar nela.
 */
export function modulosPortal(
  sections: string[] | null | undefined,
  quotesEnabled: boolean,
): ModuloInfo[] {
  const semConfiguracao = sections == null || sections.length === 0;
  const tem = (s: string) => semConfiguracao || sections.includes(s);
  const out: ModuloInfo[] = [];
  for (const m of CATALOGO) {
    if (m.chave === "conversas") { out.push(m); continue; }
    if (m.chave === "revisao") {
      if ((tem("revisao") && quotesEnabled) || tem("fechamento")) out.push(m);
      continue;
    }
    if (m.secao && tem(m.secao)) out.push(m);
  }
  return out;
}

// ── Ferramentas: o que NÃO tem tela no celular ───────────────────────────────
// Decisão de produto, a mesma do aplicativo: a barra leva só o que se usa o dia
// inteiro. Painel, Equipe, Frete, Consumo, IA, Aprendizado e Objeções são
// trabalho de MESA — relatório, configuração, auditoria — e continuam no portal
// web, numa tela grande onde cabem.
//
// Elas aparecem na folha "Mais" mesmo assim, e é de propósito: sumir em silêncio
// faz o produto parecer incompleto; dizer ONDE estão faz parecer deliberado.

export interface Ferramenta { chave: string; rotulo: string }

/** Mesma ordem e mesmos rótulos do aplicativo, para as duas telas concordarem. */
const FERRAMENTAS: Ferramenta[] = [
  { chave: "equipe", rotulo: "Equipe" },
  { chave: "painel", rotulo: "Painel" },
  { chave: "ia", rotulo: "IA" },
  { chave: "aprendizado", rotulo: "Aprendizado" },
  { chave: "objecoes", rotulo: "Objeções" },
  { chave: "consumo", rotulo: "Consumo" },
  { chave: "frete", rotulo: "Frete" },
];

/** As que ESTE usuário tem — sem link, porque no celular elas não têm tela. */
export function ferramentasDoPortal(sections: string[] | null | undefined): Ferramenta[] {
  const semConfiguracao = sections == null || sections.length === 0;
  return FERRAMENTAS.filter((f) => semConfiguracao || sections.includes(f.chave));
}
