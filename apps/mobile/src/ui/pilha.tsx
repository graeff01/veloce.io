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
        // Sem `headerTransparent`: com ele o cabeçalho não reserva espaço e a
        // lista passa POR BAIXO, desenhando o título sobre as conversas.
        //
        // Mas "transparent" AQUI, com o cabeçalho opaco, fazia o iOS cair no
        // material cinza do sistema — a faixa que aparecia fixa no topo. Pintando
        // com a mesma cor do conteúdo, a barra desaparece visualmente: no topo
        // não há nada e, ao rolar, só o título entra.
        headerStyle: { backgroundColor: theme.surface },
        // REGRA DO PRODUTO: título compacto na barra, nunca título grande.
        // O título grande come um terço da primeira tela e some ao rolar — num
        // app de trabalho, onde a pessoa quer ver conteúdo já na abertura, ele
        // custa mais do que entrega. Vale para toda aba, inclusive as futuras:
        // definido aqui, ninguém precisa lembrar de repetir.
        headerLargeTitle: false,
        headerTintColor: theme.accent,
        headerTitleStyle: { color: theme.text },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: theme.surface },
      }}
    />
  );
}
