// ── Barra inferior flutuante ──────────────────────────────────────────────────
// Porte de components/portal/portal-mobile-nav.tsx: pílula com blur, raio 22,
// quatro itens e badge verde. Mesma disposição, mesmos ícones (lucide), mesmas
// medidas — o que muda é que aqui o blur é nativo (expo-blur), não CSS.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { FileText, Clock, Megaphone, MessageCircle } from "lucide-react-native";
import { useSession } from "./session";
import { accentAlpha, buildTheme, VERDE_ESPERA } from "./theme";
import { useColorScheme } from "react-native";

const ICONES: Record<string, typeof MessageCircle> = {
  "conversas/index": MessageCircle,
  aguardando: Clock,
  anuncios: Megaphone,
  revisao: FileText,
};

const ROTULOS: Record<string, string> = {
  "conversas/index": "Conversas",
  aguardando: "Aguardando",
  anuncios: "Anúncios",
  revisao: "Orçamentos",
};

/** Contadores da barra — mesmo endpoint e mesma cadência do PWA. */
export function useBadges(): { waiting: number; reviews: number } {
  const { client, status } = useSession();
  const [v, setV] = useState({ waiting: 0, reviews: 0 });

  useEffect(() => {
    if (status !== "logado" || !client) return;
    let vivo = true;
    const tick = async () => {
      try {
        const d = await client.badges();
        if (vivo) setV(d);
      } catch { /* badge é enfeite: falhar aqui não pode aparecer para o usuário */ }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => { vivo = false; clearInterval(id); };
  }, [client, status]);

  return v;
}

interface Rota { key: string; name: string }
interface EstadoAbas { index: number; routes: Rota[] }
interface NavegacaoAbas {
  emit(e: { type: "tabPress"; target: string; canPreventDefault: true }): { defaultPrevented: boolean };
  navigate(nome: string): void;
}

export function BarraInferior({ state, navigation }: { state: EstadoAbas; navigation: NavegacaoAbas }) {
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const badges = useBadges();
  const s = styles(theme);

  // Entrada deslizando de baixo — equivale à animação `portalBarUp` do CSS.
  const sobe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(sobe, {
      toValue: 1, duration: 340, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true,
    }).start();
  }, [sobe]);

  const visiveis = state.routes.filter((r) => r.name in ICONES);

  const contagem = useCallback((nome: string) => {
    if (nome === "aguardando") return badges.waiting;
    if (nome === "revisao") return badges.reviews;
    return 0;
  }, [badges]);

  return (
    <Animated.View
      style={[
        s.wrap,
        {
          bottom: insets.bottom + 12,
          opacity: sobe,
          transform: [{ translateY: sobe.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      <BlurView intensity={40} tint={theme.dark ? "dark" : "light"} style={s.blur}>
        {visiveis.map((route) => {
          const indice = state.routes.findIndex((r) => r.key === route.key);
          const on = state.index === indice;
          const Icone = ICONES[route.name]!;
          const badge = contagem(route.name);

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={ROTULOS[route.name]}
              onPress={() => {
                const evento = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!on && !evento.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[s.item, on && { backgroundColor: accentAlpha(theme.accent, 0.11) }]}
            >
              <View style={[s.iconeBox, !on && s.iconeInativo]}>
                <Icone size={20} color={on ? theme.accent : theme.waMuted} strokeWidth={on ? 2.4 : 2} />
                {badge > 0 ? (
                  <View style={s.badge}>
                    <Text style={s.badgeTexto}>{badge > 99 ? "99+" : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[s.rotulo, { color: on ? theme.accent : theme.waMuted, fontWeight: on ? "700" : "500" }]}>
                {ROTULOS[route.name]}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </Animated.View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    wrap: {
      position: "absolute", left: 16, right: 16, zIndex: 30,
      borderRadius: 22, overflow: "hidden",
      borderWidth: 1, borderColor: t.border,
      // sombra equivalente a `0 4px 20px rgba(0,0,0,.10)`
      shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
      elevation: 8,
      backgroundColor: t.dark ? "rgba(20,23,29,0.78)" : "rgba(255,255,255,0.78)",
    },
    blur: { flexDirection: "row", gap: 2, padding: 5 },
    item: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 16 },
    iconeBox: { position: "relative" },
    iconeInativo: { opacity: 0.75 },
    badge: {
      position: "absolute", top: -5, right: -10, minWidth: 15, height: 15,
      paddingHorizontal: 4, borderRadius: 8, backgroundColor: VERDE_ESPERA,
      alignItems: "center", justifyContent: "center",
    },
    badgeTexto: { color: "#fff", fontSize: 9.5, fontWeight: "800" },
    rotulo: { fontSize: 10.5, letterSpacing: -0.1 },
  });
