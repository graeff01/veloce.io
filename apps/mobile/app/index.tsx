import { ActivityIndicator, useColorScheme, View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";

// ── Rota raiz ─────────────────────────────────────────────────────────────────
// O app SEMPRE abre aqui: ícone na tela inicial, deep link ("veloce://") e o
// Expo Go (que entra por "exp://…/--/", ou seja, caminho "/").
//
// Sem este arquivo o expo-router não encontra rota para "/" e mostra a tela
// "Unmatched Route" — foi exatamente o que aconteceu no primeiro teste em
// aparelho. O guardião do _layout é rede de segurança; quem decide o destino da
// abertura é esta rota.
export default function Index() {
  const { status, me } = useSession();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");

  if (status === "carregando") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return <Redirect href={status === "logado" ? "/(app)/conversas" : "/vincular"} />;
}
