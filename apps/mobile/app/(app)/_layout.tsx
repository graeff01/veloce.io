import { useColorScheme } from "react-native";
import { Tabs } from "expo-router";
import { useSession } from "../../src/ui/session";
import { buildTheme } from "../../src/ui/theme";

// Abas derivadas das SEÇÕES que o servidor autorizou em `/me`. Cliente sem
// orçamento não vê Revisão. Isso é UX: quem nega de verdade é o backend.
export default function AppLayout() {
  const { me, can } = useSession();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const mostrarRevisao = can("revisao") && me?.quotesEnabled === true;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="conversas" options={{ title: "Conversas" }} />
      <Tabs.Screen name="revisao" options={{ title: "Revisão", href: mostrarRevisao ? undefined : null }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil" }} />
    </Tabs>
  );
}
