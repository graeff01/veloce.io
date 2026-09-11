// ── Escala tipográfica do iOS ─────────────────────────────────────────────────
// Antes eu inventava tamanhos (17, 15, 12.5, 11…). O iOS tem uma escala real, e
// usá-la é metade do que faz um app "parecer app": os mesmos degraus, os mesmos
// pesos e as mesmas entrelinhas que todo aplicativo do sistema usa.
//
// Valores de Human Interface Guidelines, tamanho padrão (Large). O Dynamic Type
// escala tudo isso a partir daqui.

export const TIPO = {
  /** Título de tela grande (o que colapsa na barra). */
  tituloGrande: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -0.4, lineHeight: 41 },
  /** Título de seção forte. */
  titulo2: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.26, lineHeight: 28 },
  titulo3: { fontSize: 20, fontWeight: "600" as const, letterSpacing: -0.23, lineHeight: 25 },
  /** Destaque de item — nome do lead, título de cartão. */
  destaque: { fontSize: 17, fontWeight: "600" as const, letterSpacing: -0.43, lineHeight: 22 },
  /** Corpo. No iOS o corpo é 17, não 15 — texto menor que isso lê como web. */
  corpo: { fontSize: 17, fontWeight: "400" as const, letterSpacing: -0.43, lineHeight: 22 },
  /** Segunda linha: prévia de mensagem, subtítulo. */
  subtitulo: { fontSize: 15, fontWeight: "400" as const, letterSpacing: -0.23, lineHeight: 20 },
  /** Apoio: hora, metadados. */
  nota: { fontSize: 13, fontWeight: "400" as const, letterSpacing: -0.08, lineHeight: 18 },
  /** Legenda: rótulos de métrica, marcadores. */
  legenda: { fontSize: 12, fontWeight: "400" as const, lineHeight: 16 },
  legenda2: { fontSize: 11, fontWeight: "400" as const, letterSpacing: 0.07, lineHeight: 13 },
} as const;

/** Cabeçalho de seção em lista agrupada — maiúsculas espaçadas, como nos Ajustes. */
export const CABECALHO_SECAO = {
  fontSize: 13, fontWeight: "400" as const, letterSpacing: -0.08, textTransform: "uppercase" as const,
};
