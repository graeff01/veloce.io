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
