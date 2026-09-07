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
      <Tabs.Screen name="conversas" options={{ title: "Conversas" }} />
      <Tabs.Screen name="anuncios" options={{ title: "Anúncios", href: visivel("anuncios") }} />
      <Tabs.Screen name="funil" options={{ title: "Funil", href: visivel("funil") }} />
      <Tabs.Screen name="revisao" options={{ title: "Orçamentos", href: visivel("revisao") }} />
    </Tabs>
  );
}
