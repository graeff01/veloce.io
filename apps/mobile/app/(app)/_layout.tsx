import { Tabs } from "expo-router";
import { BarraInferior } from "../../src/ui/nav";
import { useSession } from "../../src/ui/session";

// Disposição IGUAL à do PWA: Conversas · Aguardando · Anúncios · Orçamentos.
// "Aguardando" e "Anúncios" são filtros da mesma lista, como os ?tab= do web.
// Perfil sai da barra (o portal também não o tem lá) e é aberto pelo cabeçalho.
export default function AppLayout() {
  const { me, can } = useSession();
  const mostrarOrcamentos = can("revisao") && me?.quotesEnabled === true;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BarraInferior {...props} />}>
      <Tabs.Screen name="conversas/index" options={{ title: "Conversas" }} />
      <Tabs.Screen name="aguardando" options={{ title: "Aguardando" }} />
      <Tabs.Screen name="anuncios" options={{ title: "Anúncios" }} />
      <Tabs.Screen name="revisao" options={{ title: "Orçamentos", href: mostrarOrcamentos ? undefined : null }} />
      {/* Fora da barra: detalhe da conversa e perfil. */}
      <Tabs.Screen name="conversas/[contactId]" options={{ href: null }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
    </Tabs>
  );
}
