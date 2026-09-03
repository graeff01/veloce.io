// ── Espaçamento, raio e curva ─────────────────────────────────────────────────
// Três coisas que eu vinha fazendo no olho e que denunciam "web" mais do que
// qualquer cor:
//
// 1. MARGENS ARBITRÁRIAS. Eu usava 11, 12, 14, 16 sem critério. O iOS trabalha
//    numa malha de 4, com 16 de goteira lateral. Ritmo irregular o olho percebe
//    mesmo sem saber nomear.
//
// 2. RAIO SEM CURVA CONTÍNUA. Um `borderRadius` comum desenha um arco de
//    círculo. O iOS usa squircle — a curva que o ícone, o cartão e a folha do
//    sistema têm. `borderCurve: "continuous"` liga isso, e é provavelmente o
//    ajuste isolado mais barato para a tela parar de parecer página.
//
// 3. RAIOS DESALINHADOS. Cada componente tinha o seu (10, 11, 14, 19, 22).

export const ESP = {
  xs: 4, sm: 8, md: 12,
  /** Goteira lateral padrão do iOS. */
  gutter: 16,
  lg: 20, xl: 24, xxl: 32,
} as const;

export const RAIO = {
  /** Campo, botão pequeno. */
  peq: 10,
  /** Cartão, grupo de lista. */
  medio: 14,
  /** Folha, superfície grande. */
  grande: 20,
  /** Pílula: metade da altura. */
  pilula: 999,
} as const;

/** Aplique junto de qualquer borderRadius: é o que dá a curva do sistema. */
export const CURVA = { borderCurve: "continuous" } as const;

/** Cartão padrão: curva contínua, sombra rente. Sem borda — o tom já separa. */
export const cartao = (fundo: string) => ({
  backgroundColor: fundo,
  borderRadius: RAIO.medio,
  ...CURVA,
  shadowColor: "#000",
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
});
