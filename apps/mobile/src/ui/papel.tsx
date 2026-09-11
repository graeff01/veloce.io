// ── Fundo do chat: papel, não cor chapada ─────────────────────────────────────
// Uma cor lisa atrás dos balões é o que mais entrega "isto é uma página web".
// O WhatsApp usa um papel com rabiscos esparsos e de baixíssimo contraste — o
// olho não os lê como desenho, lê como TEXTURA, e é isso que dá profundidade.
//
// O padrão aqui é original (não é a arte do WhatsApp): traços simples de cozinha
// e conversa, espalhados numa malha que não repete de forma óbvia. Fica em ~5%
// de opacidade sobre o tom quente do tema.

import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, G, Path, Pattern, Rect } from "react-native-svg";

/** Glifos do padrão. Traço só, sem preenchimento — textura, não ilustração. */
const GLIFOS = [
  // balão de conversa
  "M4 3h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3v-3H4a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z",
  // chama
  "M10 1c1 3-2 4-2 7a4 4 0 0 0 8 0c0-2-1-3-2-5 0 2-1 3-2 3s-2-2-2-5z",
  // espeto
  "M2 14 16 2M14 2h3v3M4 12l2 2",
  // coração
  "M9 15S2 11 2 6.5A3.5 3.5 0 0 1 9 5a3.5 3.5 0 0 1 7 1.5C16 11 9 15 9 15z",
  // check duplo
  "M1 8l4 4 7-8M8 12l1 1 7-8",
  // xícara
  "M3 4h11v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V4zM14 6h2a2 2 0 0 1 0 4h-2",
];

/**
 * Posições dentro do bloco de 200×200. Escolhidas à mão para não formar linhas
 * nem colunas visíveis quando o bloco se repete — malha regular vira listra.
 */
const POSICOES: { x: number; y: number; g: number; r: number; e: number }[] = [
  { x: 14, y: 18, g: 0, r: -12, e: 1.0 },
  { x: 96, y: 8, g: 2, r: 20, e: 0.9 },
  { x: 156, y: 40, g: 1, r: -6, e: 1.1 },
  { x: 44, y: 70, g: 4, r: 8, e: 0.95 },
  { x: 122, y: 92, g: 5, r: -16, e: 1.0 },
  { x: 8, y: 128, g: 3, r: 14, e: 0.9 },
  { x: 74, y: 148, g: 1, r: -22, e: 1.05 },
  { x: 168, y: 132, g: 0, r: 10, e: 0.85 },
  { x: 36, y: 186, g: 5, r: 18, e: 0.9 },
  { x: 138, y: 176, g: 4, r: -8, e: 1.0 },
];

/**
 * `cor` é a tinta dos rabiscos (não o fundo). No claro, um marrom acinzentado
 * sobre o creme; no escuro, um cinza claro sobre o quase-preto.
 */
function PapelBase({ cor, opacidade }: { cor: string; opacidade: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="papel" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <G stroke={cor} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={opacidade}>
              {POSICOES.map((p, i) => (
                <G key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.r}) scale(${p.e})`}>
                  <Path d={GLIFOS[p.g]} />
                </G>
              ))}
            </G>
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#papel)" />
      </Svg>
    </View>
  );
}

export const Papel = memo(PapelBase);
