// ── Linha de evolução ─────────────────────────────────────────────────────────
// O gasto por dia do período, desenhado como um traço só. Não é gráfico de
// análise — é o formato da coisa, para saber de relance se subiu ou caiu.
//
// A linha se DESENHA ao entrar (stroke-dashoffset indo a zero) e o ponto da
// ponta pulsa devagar enquanto a tela está aberta: é o sinal de que o número é
// do agora, e o "algo vivo" da aba.

import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import Animated, {
  Easing, useAnimatedProps, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";

const Traco = Animated.createAnimatedComponent(Path);
const Ponto = Animated.createAnimatedComponent(Circle);

export function Sparkline({ valores, cor, largura, altura = 46 }: {
  valores: number[]; cor: string; largura: number; altura?: number;
}) {
  const desenho = useSharedValue(1); // 1 = escondida, 0 = desenhada
  const pulso = useSharedValue(1);

  const { linha, area, fim, comprimento } = useMemo(() => {
    const n = valores.length;
    const pad = 3;
    const w = Math.max(1, largura - pad * 2);
    const h = altura - pad * 2;
    const max = Math.max(...valores, 1);
    const min = Math.min(...valores, 0);
    const faixa = max - min || 1;
    const px = (i: number) => pad + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const py = (v: number) => pad + h - ((v - min) / faixa) * h;

    const pts = valores.map((v, i) => [px(i), py(v)] as const);
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const sob = `${d} L${px(n - 1).toFixed(1)} ${(altura - pad).toFixed(1)} L${px(0).toFixed(1)} ${(altura - pad).toFixed(1)} Z`;

    // Comprimento aproximado, suficiente para o traço-fantasma da animação.
    let c = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!;
      c += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return { linha: d, area: sob, fim: pts[pts.length - 1] ?? [0, 0], comprimento: Math.max(c, 1) };
  }, [valores, largura, altura]);

  useEffect(() => {
    desenho.value = 1;
    desenho.value = withDelay(160, withTiming(0, { duration: 760, easing: Easing.out(Easing.cubic) }));
    // Respiração lenta: 1,8s por ciclo. Rápido demais vira alarme.
    pulso.value = withDelay(900, withRepeat(
      withSequence(
        withTiming(1.75, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ), -1, false));
  }, [linha, desenho, pulso]);

  const propsTraco = useAnimatedProps(() => ({ strokeDashoffset: desenho.value * comprimento }));
  const propsPonto = useAnimatedProps(() => ({ r: 2.6 * pulso.value, opacity: 1.15 - pulso.value * 0.4 }));

  if (valores.length < 2) return <View style={{ height: altura }} />;

  return (
    <Svg width={largura} height={altura}>
      <Defs>
        <LinearGradient id="sob" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={cor} stopOpacity={0.22} />
          <Stop offset="1" stopColor={cor} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#sob)" />
      <Traco
        d={linha}
        stroke={cor}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={comprimento}
        animatedProps={propsTraco}
      />
      <Ponto cx={fim[0]} cy={fim[1]} fill={cor} animatedProps={propsPonto} />
      <Circle cx={fim[0]} cy={fim[1]} r={2.4} fill={cor} />
    </Svg>
  );
}
