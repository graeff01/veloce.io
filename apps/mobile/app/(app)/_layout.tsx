import { Tabs } from "expo-router";
import { BarraInferior, useModulosVisiveis } from "../../src/ui/nav";

// Abas = MÓDULOS. Filtros ficam dentro de Conversas.
// A visibilidade por tenant é decidida em `useModulosVisiveis` (sections +
// quotesEnabled), fonte única compartilhada com a barra.
export default function AppLayout() {
  const visiveis = useModulosVisiveis();
  const visivel = (nome: string) => (visiveis.includes(nome as never) ? undefined : null);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BarraInferior {...props} />}>
      <Tabs.Screen name="conversas/index" options={{ title: "Conversas" }} />
      <Tabs.Screen name="anuncios" options={{ title: "Anúncios", href: visivel("anuncios") }} />
      <Tabs.Screen name="revisao" options={{ title: "Orçamentos", href: visivel("revisao") }} />
      <Tabs.Screen name="mais" options={{ title: "Mais" }} />
      {/* Fora da barra: detalhe da conversa e perfil. */}
      <Tabs.Screen name="conversas/[contactId]" options={{ href: null }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
    </Tabs>
  );
}
