// ── Diário de bordo do app ────────────────────────────────────────────────────
// Quando a vendedora diz "deu erro", ninguém tem o console do Metro na mão. Sem
// isto, o relato chega como "não funcionou" e a investigação começa do zero.
//
// Guardamos em MEMÓRIA as últimas ocorrências, já redigidas pelo `safeForLog` —
// nunca em disco, nunca enviadas sozinhas. O relatório só sai do aparelho quando
// a pessoa toca em compartilhar, e é ela quem escolhe para onde.
//
// Não é telemetria: não há coleta automática, não há servidor recebendo, e o
// conteúdo das conversas nunca entra aqui (ver redact.ts).

export type Nivel = "info" | "aviso" | "erro";

export interface Ocorrencia {
  em: number;      // epoch ms
  nivel: Nivel;
  texto: string;   // JÁ redigido
}

/** Teto pequeno de propósito: interessa o que aconteceu perto da falha. */
export const TETO = 40;

/** Anexa mantendo só as TETO mais recentes. Pura: devolve lista nova. */
export function anexar(diario: Ocorrencia[], o: Ocorrencia): Ocorrencia[] {
  const proximo = [...diario, o];
  return proximo.length <= TETO ? proximo : proximo.slice(proximo.length - TETO);
}

/** Só o que interessa a quem investiga: avisos e erros. */
export const relevantes = (diario: Ocorrencia[]): Ocorrencia[] =>
  diario.filter((o) => o.nivel !== "info");

const hora = (em: number): string => {
  const d = new Date(em);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(d.getHours())}:${dd(d.getMinutes())}:${dd(d.getSeconds())}`;
};

/**
 * O texto que a pessoa compartilha. Cabeçalho com o contexto técnico (versão,
 * aparelho, servidor) porque é a primeira pergunta de qualquer investigação.
 */
export function relatorio(diario: Ocorrencia[], ctx: {
  versao: string; aparelho: string; sistema: string; servidor: string;
}): string {
  const linhas = relevantes(diario).map(
    (o) => `${hora(o.em)}  ${o.nivel === "erro" ? "ERRO " : "aviso"}  ${o.texto}`,
  );
  return [
    "Diagnóstico do app Veloce",
    `Versão: ${ctx.versao}`,
    `Aparelho: ${ctx.aparelho} · ${ctx.sistema}`,
    `Servidor: ${ctx.servidor}`,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    "",
    linhas.length ? linhas.join("\n") : "Nenhum erro registrado nesta sessão.",
  ].join("\n");
}
