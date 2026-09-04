// ── Número que conta ──────────────────────────────────────────────────────────
// Um valor que aparece pronto não comunica nada. Contando de zero até ele, o
// olho acompanha a grandeza e a tela ganha vida sem precisar de enfeite.
//
// A contagem roda na thread de UI (Reanimated escrevendo direto no TextInput),
// e não em estado do React — senão seriam ~60 re-renderizações por segundo só
// para animar um texto.

import { useEffect } from "react";
import { StyleSheet, TextInput, type TextStyle } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from "react-native-reanimated";

const Campo = Animated.createAnimatedComponent(TextInput);

/**
 * Formata sem Intl (que não existe na thread de UI). É `worklet` para rodar
 * na animação E função normal para o React usar na renderização — a MESMA
 * função nos dois lados, senão o texto pisca ao trocar de um para o outro.
 */
function formatar(v: number, moeda: boolean, prefixo: string): string {
  "worklet";
  const n = Math.round(v);
  const s = String(Math.abs(n));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ".";
    out += s[i];
  }
  return `${n < 0 ? "-" : ""}${moeda ? prefixo : ""}${out}`;
}

export function NumeroAnimado({ valor, estilo, moeda = false, prefixo = "R$ ", duracao = 900 }: {
  valor: number;
  estilo?: TextStyle | TextStyle[];
  moeda?: boolean;
  prefixo?: string;
  duracao?: number;
}) {
  const v = useSharedValue(0);

  useEffect(() => {
    // `easing` que desacelera no fim: o número "assenta" no valor em vez de parar seco.
    v.value = withTiming(valor, { duration: duracao, easing: Easing.out(Easing.cubic) });
  }, [valor, duracao, v]);

  const texto = formatar(valor, moeda, prefixo);
  const props = useAnimatedProps(() => ({ text: formatar(v.value, moeda, prefixo) }) as never);

  return (
    <Campo
      editable={false}
      // O TextInput vira só uma superfície de texto: sem foco, sem teclado.
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[estilos.base, estilo]}
      // `value` garante o texto certo em toda renderização; `animatedProps`
      // sobrescreve enquanto a contagem roda.
      value={texto}
      animatedProps={props}
    />
  );
}

const estilos = StyleSheet.create({
  base: { padding: 0, margin: 0 },
});
