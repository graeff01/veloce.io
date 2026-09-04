import { useEffect } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Stack, useRouter, useSegments } from "expo-router";
import { SessionProvider, useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";
import { configurarApresentacao, ouvirNotificacoes, registrarPush } from "../src/ui/push";

configurarApresentacao();

/**
 * Rotas de raiz que são folhas modais — legítimas com sessão ativa.
 *
 * Todas abrem numa altura FIXA. Com duas alturas permitidas, arrastar entre
 * elas desmontava a folha no meio do caminho; e como o conteúdo de cada uma
 * tem altura conhecida, a segunda altura não trazia nada. Fechar arrastando
 * para baixo continua funcionando.
 */
const MODAIS = new Set(["perfil", "acoes", "pdf", "campanhas", "mais"]);

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
    // Perfil e Ações são rotas de RAIZ (folhas modais), não ficam dentro de (app).
    // Sem esta linha o Guard as tratava como "fora do app" e devolvia o usuário
    // para Conversas no instante em que a folha abria — era por isso que tocar em
    // Mais › Conta piscava e voltava para as mensagens.
    const emFolha = MODAIS.has(String(segments[0] ?? ""));
    // Sem sessão: manda para o vínculo de QUALQUER lugar que não seja ele mesmo.
    // A versão anterior só agia quando já estávamos dentro de (app) — então na
    // rota raiz nada acontecia e o app ficava preso na tela de rota inexistente.
    if (status === "sem-sessao" && !emVincular) router.replace("/vincular");
    if (status === "logado" && !dentro && !emFolha) router.replace("/(app)/conversas");
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="vincular" />
        <Stack.Screen name="(app)" />
        {/* Perfil é MODAL: sobe de baixo e fecha arrastando, como no iOS. Assim
            é alcançável de Conversas e de Mais sem existir duas vezes. */}
        <Stack.Screen
          name="perfil"
          options={{
            headerShown: true,
            // Folha que sobe até 60% e pode ser arrastada até o topo. Modal de
            // tela cheia para uma tela curta é desperdício de contexto.
            presentation: "formSheet",
            sheetAllowedDetents: [0.62],
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
          }}
        />
        <Stack.Screen
          name="pdf"
          options={{
            headerShown: true,
            presentation: "formSheet",
            sheetAllowedDetents: [0.94],
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
          }}
        />
        <Stack.Screen
          name="mais"
          options={{
            headerShown: true,
            presentation: "formSheet",
            sheetAllowedDetents: [0.68],
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
          }}
        />
        <Stack.Screen
          name="campanhas"
          options={{
            headerShown: true,
            presentation: "formSheet",
            // Altura enxuta: a JR tem uma campanha só. Uma folha de 60% para
            // duas linhas era quase toda espaço vazio.
            sheetAllowedDetents: [0.42],
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
          }}
        />
        <Stack.Screen
          name="acoes"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.72],
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    // GestureHandlerRootView na raiz: sem ela o deslizar da lista não recebe
    // os toques. Precisa envolver TUDO, inclusive os modais.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <Guard />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
