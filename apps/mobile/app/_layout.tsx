import { useEffect } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Slot, useRouter, useSegments } from "expo-router";
import { SessionProvider, useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";

// Guardião de navegação: mantém a rota coerente com o estado de sessão.
// É conveniência de UX — a autorização real acontece no servidor a cada chamada.
function Guard() {
  const { status, me } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const systemDark = useColorScheme() === "dark";
  const theme = buildTheme(me?.brand ?? null, systemDark);

  useEffect(() => {
    if (status === "carregando") return;
    const dentro = segments[0] === "(app)";
    if (status === "sem-sessao" && dentro) router.replace("/vincular");
    if (status === "logado" && !dentro) router.replace("/(app)/conversas");
  }, [status, segments, router]);

  if (status === "carregando") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Guard />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
