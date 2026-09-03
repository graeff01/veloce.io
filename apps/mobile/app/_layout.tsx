import { useEffect } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Slot, useRouter, useSegments } from "expo-router";
import { SessionProvider, useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";
import { configurarApresentacao, ouvirNotificacoes, registrarPush } from "../src/ui/push";

configurarApresentacao();

// Guardião de navegação: mantém a rota coerente com o estado de sessão.
// É conveniência de UX — a autorização real acontece no servidor a cada chamada.
function Guard() {
  const { status, me, client } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const systemDark = useColorScheme() === "dark";
  const theme = buildTheme(me?.brand ?? null, systemDark);

  useEffect(() => {
    if (status === "carregando") return;
    const dentro = segments[0] === "(app)";
    const emVincular = segments[0] === "vincular";
    // Sem sessão: manda para o vínculo de QUALQUER lugar que não seja ele mesmo.
    // A versão anterior só agia quando já estávamos dentro de (app) — então na
    // rota raiz nada acontecia e o app ficava preso na tela de rota inexistente.
    if (status === "sem-sessao" && !emVincular) router.replace("/vincular");
    if (status === "logado" && !dentro) router.replace("/(app)/conversas");
  }, [status, segments, router]);

  // Push só depois de logado: o registro precisa de sessão para saber de qual
  // cliente e de qual vendedor é o aparelho.
  useEffect(() => {
    if (status !== "logado" || !client) return;
    void registrarPush(client);
  }, [status, client]);

  // Tocar na notificação abre a conversa certa — inclusive em cold start.
  useEffect(() => {
    if (status !== "logado") return;
    return ouvirNotificacoes((rota) => router.push(rota as never));
  }, [status, router]);

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
