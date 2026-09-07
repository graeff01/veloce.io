// ── Atalho para "Mais" no cabeçalho ───────────────────────────────────────────
// Espelha o botão de perfil do lado direito: mesmo tamanho, mesmo peso visual,
// lado oposto. A barra inferior fica só com os módulos do dia a dia.

import { Pressable, View, StyleSheet } from "react-native";
import { useEscuro } from "./aparencia";
import { useRouter } from "expo-router";
import { SIMBOLO, Simbolo } from "./simbolo";
import { useSession } from "./session";
import { useTema } from "./tema";
import { accentAlpha, buildTheme } from "./theme";

export function BotaoMais() {
  const { me } = useSession();
  const router = useRouter();
  const theme = useTema();

  return (
    <Pressable
      onPress={() => router.push("/mais")}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Mais opções"
      style={({ pressed }) => [
        estilos.alvo,
        { backgroundColor: accentAlpha(theme.accent, 0.12) },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Simbolo nome={SIMBOLO.mais as never} tamanho={22} cor={theme.accent} />
    </Pressable>
  );
}

/** Mesma moldura do botão de perfil — os dois se equilibram na barra. */
const estilos = StyleSheet.create({
  alvo: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
