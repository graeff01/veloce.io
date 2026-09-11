// ── Aviso de conexão ──────────────────────────────────────────────────────────
// Sem isto, app offline parece app quebrado: as telas mostram erro cada uma por
// si e nada explica que o problema é a rede, não o produto.
//
// A faixa aparece quando há mensagem esperando envio — que é o sinal honesto de
// que não estamos conseguindo falar com o servidor. Não inventamos um "estado de
// rede": relatamos o que realmente está acontecendo.

import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEscuro } from "./aparencia";
import { useFilaEnvio } from "./fila-envio";
import { useSession } from "./session";
import { useTema } from "./tema";
import { buildTheme } from "./theme";
import { TIPO } from "./tipografia";
import { CURVA, ESP, RAIO } from "./forma";

export function AvisoConexao() {
  const { total } = useFilaEnvio();
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const theme = useTema();
  const s = styles(theme);

  const pulso = useSharedValue(0.45);
  useEffect(() => {
    pulso.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true,
    );
  }, [pulso]);
  const ponto = useAnimatedStyle(() => ({ opacity: pulso.value }));

  if (total === 0) return null;

  return (
    <Animated.View
      style={[s.faixa, { top: insets.top + 4 }]}
      entering={FadeInUp.duration(240)}
      exiting={FadeOutUp.duration(180)}
      pointerEvents="none"
      accessibilityRole="alert"
    >
      <Animated.View style={[s.ponto, ponto]} />
      <Text style={s.texto} numberOfLines={1}>
        {total === 1 ? "Enviando 1 mensagem…" : `Enviando ${total} mensagens…`}
      </Text>
    </Animated.View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    faixa: {
      position: "absolute", alignSelf: "center", zIndex: 90,
      flexDirection: "row", alignItems: "center", gap: ESP.sm,
      paddingHorizontal: ESP.gutter, paddingVertical: 7,
      borderRadius: RAIO.pilula, ...CURVA,
      backgroundColor: t.dark ? "rgba(30,34,42,0.94)" : "rgba(20,23,29,0.90)",
      shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#f5b544" },
    texto: { ...TIPO.legenda, color: "#fff", fontWeight: "600" },
  });
