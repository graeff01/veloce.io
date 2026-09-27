// ── Módulos da barra inferior (PWA no celular) ───────────────────────────────
// A barra lista MÓDULOS, não filtros. Filtros vivem dentro do módulo — foi a
// regra que definimos no aplicativo, e é o que evita a barra virar um painel de
// controle com sete botões.
//
// MESMA REGRA de `apps/mobile/src/core/inbox.ts` (modulosPara). Duplicada de
// propósito: o app é um projeto Expo com bundler próprio e não importa daqui.
// `tests/portal-modulos.test.ts` repete os casos do teste de lá — se as duas
// barras discordarem, a vendedora encontra um app e um site diferentes.
//
// UMA DIFERENÇA CONHECIDA, e de propósito: aqui Equipe pode entrar na barra
// (ver o comentário no catálogo); no aplicativo ela ainda é uma tela de topo,
// fora das abas. O aplicativo não foi lançado e a tela existe e é alcançável
// por lá — mover a rota no Expo é trabalho para quando ele for ao ar.

export type ModuloPortal = "conversas" | "anuncios" | "funil" | "revisao" | "equipe";

export interface ModuloInfo {
  chave: ModuloPortal;
  rotulo: string;
  /** Caminho a partir de /r/<token>. */
  caminho: string;
}

// A ORDEM é a prioridade: o que não couber na barra continua alcançável pelo
// menu lateral (no computador) e pela folha "Mais".
const CATALOGO: { chave: ModuloPortal; rotulo: string; caminho: string; secao: string | null }[] = [
  { chave: "conversas", rotulo: "Conversas", caminho: "/conversas", secao: null },
  { chave: "anuncios", rotulo: "Anúncios", caminho: "/anuncios", secao: "anuncios" },
  { chave: "funil", rotulo: "Funil", caminho: "/funil", secao: "funil" },
  { chave: "revisao", rotulo: "Orçamentos", caminho: "/revisao", secao: "revisao" },
  // Equipe entra no FIM: para um cliente com o produto inteiro ligado, os quatro
  // de cima já ocupam a barra e ela segue sendo trabalho de mesa. Mas para quem
  // tem poucas seções — a Jardim do Lago são três, e acompanhar é o trabalho
  // INTEIRO das gerentes — mandá-la para "no portal web" deixaria a pessoa sem
  // chegar no celular naquilo que ela mais usa.
  { chave: "equipe", rotulo: "Equipe", caminho: "/equipe", secao: "equipe" },
];

/** Quantos destinos cabem na barra antes de os alvos ficarem pequenos demais. */
const MAX_BARRA = 4;

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
  return out.slice(0, MAX_BARRA);
}

// ── Ferramentas: o que fica FORA da barra de baixo ───────────────────────────
// Decisão de produto, a mesma do aplicativo: a barra leva só o que se usa o dia
// inteiro. Painel, Equipe, Frete, IA, Aprendizado e Objeções são trabalho de
// MESA — relatório, configuração, auditoria — e continuam no portal web, numa
// tela grande onde cabem.
//
// Elas aparecem na folha "Mais" mesmo assim, e é de propósito: sumir em silêncio
// faz o produto parecer incompleto; dizer ONDE estão faz parecer deliberado.
//
// EXCEÇÃO com `caminho`: a ferramenta TEM tela no celular e a folha leva até ela.
// CONSUMO é a primeira. Ela não é trabalho de mesa — é o número que se olha de
// relance ("quantos atendimentos já usei do meu plano?"), e mandar quem está no
// telefone abrir o computador para ver um número era o defeito, não a regra.
// Continua fora da barra porque não se usa o dia inteiro.

export interface Ferramenta {
  chave: string;
  rotulo: string;
  /** Caminho a partir de /r/<token>. Ausente = sem tela no celular. */
  caminho?: string;
}

/** Mesma ordem e mesmos rótulos do aplicativo, para as duas telas concordarem. */
const FERRAMENTAS: Ferramenta[] = [
  { chave: "equipe", rotulo: "Equipe" },
  { chave: "painel", rotulo: "Painel" },
  { chave: "ia", rotulo: "IA" },
  { chave: "aprendizado", rotulo: "Aprendizado" },
  { chave: "objecoes", rotulo: "Objeções" },
  { chave: "consumo", rotulo: "Consumo", caminho: "/consumo" },
  { chave: "frete", rotulo: "Frete" },
];

/**
 * As que ESTE usuário tem — sem link, porque no celular elas não têm tela.
 *
 * `naBarra` é o que a barra já leva: dizer "no portal web" sobre algo que está
 * a um toque de distância, na mesma tela, seria simplesmente falso.
 */
export function ferramentasDoPortal(
  sections: string[] | null | undefined,
  naBarra: readonly string[] = [],
): Ferramenta[] {
  const semConfiguracao = sections == null || sections.length === 0;
  return FERRAMENTAS.filter((f) =>
    !naBarra.includes(f.chave) && (semConfiguracao || sections.includes(f.chave)));
}
