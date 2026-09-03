import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { useSession } from "./session";
import { buildTheme } from "./theme";

// ── Pilha nativa de um módulo ─────────────────────────────────────────────────
// Cada aba tem a SUA pilha, como manda o padrão do iOS. Daí vêm, prontos:
// título grande que encolhe, header translúcido com o conteúdo passando por
// baixo, transição empurrando da direita e o gesto de voltar pela borda.
//
// Definição única: se a identidade do header mudar, muda em um lugar só.
export function PilhaModulo() {
  const { me } = useSession();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");

  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerBlurEffect: theme.dark ? "systemChromeMaterialDark" : "systemChromeMaterialLight",
        headerStyle: { backgroundColor: "transparent" },
        headerTintColor: theme.accent,
        headerTitleStyle: { color: theme.text },
        headerLargeTitleStyle: { color: theme.text },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: theme.surface },
      }}
    />
  );
}
