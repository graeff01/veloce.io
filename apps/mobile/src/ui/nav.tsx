// ── Barra inferior: MÓDULOS do produto ────────────────────────────────────────
// Regra de produto: a barra inferior lista MÓDULOS. Filtros vivem dentro do
// módulo. O portal web mistura os dois (Aguardando e "Anúncios" são filtros da
// caixa de entrada e estão na barra) — o app não reproduz isso.
//
// FONTE ÚNICA: este componente é a única implementação da barra. O portal tem
// duas (uma inline em portal-conversations, outra em portal-mobile-nav), e é daí
// que vem o "pisca e remonta" ao abrir Orçamentos. Aqui a barra pertence ao
// layout de abas e permanece montada ao trocar de módulo.
//
// Visibilidade por tenant: derivada de `sections` + `quotesEnabled` que o /me
// devolve. Nunca por nome de cliente.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { SIMBOLO, Simbolo } from "./simbolo";
import { TIPO } from "./tipografia";
import { useSession } from "./session";
import { accentAlpha, buildTheme, VERDE_ESPERA } from "./theme";
import { modulosPara, type ModuloRota } from "../core/inbox";

type NomeRota = ModuloRota;

const MODULOS: { rota: NomeRota; rotulo: string; simbolo: string }[] = [
  { rota: "conversas", rotulo: "Conversas", simbolo: SIMBOLO.conversas },
  { rota: "anuncios", rotulo: "Anúncios", simbolo: SIMBOLO.anuncios },
  { rota: "revisao", rotulo: "Orçamentos", simbolo: SIMBOLO.orcamentos },
];

/** Contadores da barra — mesmo endpoint e cadência do PWA. */
export function useBadges(): { waiting: number; reviews: number } {
  const { client, status } = useSession();
  const [v, setV] = useState({ waiting: 0, reviews: 0 });

  useEffect(() => {
    if (status !== "logado" || !client) return;
    let vivo = true;
    const tick = async () => {
      try { const d = await client.badges(); if (vivo) setV(d); }
      catch { /* badge é enfeite: falhar aqui não pode aparecer para o usuário */ }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => { vivo = false; clearInterval(id); };
  }, [client, status]);

  return v;
}

/**
 * Módulos que ESTE tenant/usuário enxerga. Conversas e Mais são sempre visíveis
 * (a primeira é a seção obrigatória do portal; a segunda é o escape do produto).
 */
export function useModulosVisiveis(): NomeRota[] {
  const { me } = useSession();
  return modulosPara(me);
}

interface Rota { key: string; name: string; state?: { index?: number } }
interface EstadoAbas { index: number; routes: Rota[] }
interface NavegacaoAbas {
  emit(e: { type: "tabPress"; target: string; canPreventDefault: true }): { defaultPrevented: boolean };
  navigate(nome: string): void;
}

/**
 * Telas de DETALHE, empurradas de dentro de um módulo. A barra some nelas, como
 * manda a convenção do iOS — e porque na thread ela ficaria exatamente por cima
 * do compositor de mensagem.
 */
// Nada aqui: toda aba é uma pilha, e a profundidade é quem decide.
const DETALHE = new Set<string>();

export function BarraInferior({ state, navigation }: { state: EstadoAbas; navigation: NavegacaoAbas }) {
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const badges = useBadges();
  const visiveis = useModulosVisiveis();
  const s = styles(theme);
  const atual = state.routes[state.index];
  const rotaAtual = atual?.name ?? "";
  // Dentro de uma pilha aprofundada (conversa aberta) a barra sai de cena, como
  // manda a convenção do iOS — e porque cobriria o campo de mensagem.
  const emDetalhe = DETALHE.has(rotaAtual) || (atual?.state?.index ?? 0) > 0;

  // Entra deslizando UMA vez, ao montar. Como a barra pertence ao layout de abas,
  // ela não remonta ao trocar de módulo — nada de piscar entre telas.
  const sobe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(sobe, {
      toValue: 1, duration: 340, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true,
    }).start();
  }, [sobe]);

  const contagem = useCallback((rota: NomeRota) => {
    if (rota === "conversas") return badges.waiting;
    if (rota === "revisao") return badges.reviews;
    return 0;
  }, [badges]);

  if (emDetalhe) return null;

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
        {MODULOS.filter((m) => visiveis.includes(m.rota)).map(({ rota, rotulo, simbolo }) => {
          const alvo = state.routes.find((r) => r.name === rota);
          if (!alvo) return null;
          const on = state.routes[state.index]?.name === rota;
          const badge = contagem(rota);

          return (
            <Pressable
              key={rota}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={rotulo}
              onPress={() => {
                const ev = navigation.emit({ type: "tabPress", target: alvo.key, canPreventDefault: true });
                if (!on && !ev.defaultPrevented) navigation.navigate(rota);
              }}
              style={({ pressed }) => [
                s.item,
                on && { backgroundColor: accentAlpha(theme.accent, 0.11) },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={[s.iconeBox, !on && s.iconeInativo]}>
                <Simbolo
                  nome={simbolo as never}
                  tamanho={23}
                  cor={on ? theme.accent : theme.waMuted}
                  peso={on ? "semibold" : "regular"}
                />
                {badge > 0 ? (
                  <View style={s.badge}>
                    <Text style={s.badgeTexto} maxFontSizeMultiplier={1.1}>{badge > 99 ? "99+" : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[s.rotulo, { color: on ? theme.accent : theme.waMuted, fontWeight: on ? "700" : "500" }]}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
              >
                {rotulo}
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
      // Fio de cabelo em vez de 1px cheio: no iOS a borda de vidro é sutil.
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
      // Sombra em duas camadas: uma rente que dá o recorte, outra ampla que
      // levanta a pílula do conteúdo.
      shadowColor: "#000", shadowOpacity: t.dark ? 0.5 : 0.16,
      shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
      elevation: 12,
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
    rotulo: { ...TIPO.legenda2, fontSize: 10.5 },
  });
