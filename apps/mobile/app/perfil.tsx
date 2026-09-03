import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";
import { limparCacheDeMidia } from "../src/ui/media";

export default function Perfil() {
  const { me, sair, recarregar } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);
  const [saindo, setSaindo] = useState(false);

  const confirmarSaida = () => {
    Alert.alert("Sair da conta", "Sua credencial será removida deste aparelho.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          setSaindo(true);
          // Ordem importa: a mídia de leads sai do aparelho junto com a credencial.
          limparCacheDeMidia();
          await sair();
          setSaindo(false);
        },
      },
    ]);
  };

  // Exclusão de conta: a App Store normalmente exige o fluxo DENTRO do app. O
  // backend ainda não tem endpoint de exclusão de PortalAccess, então aqui só
  // orientamos — nada é excluído de verdade e nada é prometido ao usuário.
  const pedirExclusao = () => {
    Alert.alert(
      "Excluir conta",
      "A exclusão da conta ainda é feita pela sua agência. Peça a exclusão e seus dados de acesso serão removidos.",
      [{ text: "Entendi" }],
    );
  };

  return (
    <ScrollView style={s.tela} contentContainerStyle={[s.conteudo, { paddingBottom: insets.bottom + 32 }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Perfil",
          headerTransparent: false,
          headerStyle: { backgroundColor: theme.surface },
          headerTitleStyle: { color: theme.text },
          // Modal fecha por botão E arrastando para baixo — as duas formas que o
          // usuário de iPhone já tenta por instinto.
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "600" }}>Fechar</Text>
            </Pressable>
          ),
        }}
      />
      <View style={s.marcaBox}>
        {me?.brand.logoUrl ? (
          <Image source={{ uri: me.brand.logoUrl }} style={s.logo} resizeMode="contain" />
        ) : (
          <View style={[s.logoVazio, { backgroundColor: theme.accent }]}>
            <Text style={[s.logoLetra, { color: theme.onAccent }]}>
              {(me?.brand.name ?? "V").slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={s.cliente}>{me?.brand.name ?? "Veloce"}</Text>
      </View>

      <View style={s.bloco}>
        <Linha rotulo="Você" valor={me?.user?.name ?? me?.user?.email ?? "—"} theme={theme} />
        <Linha rotulo="E-mail" valor={me?.user?.email ?? "—"} theme={theme} />
        <Linha rotulo="Papel" valor={me?.user?.role === "admin" ? "Administrador" : "Atendente"} theme={theme} />
      </View>

      <Text style={s.secaoTitulo}>Suas áreas</Text>
      <View style={s.bloco}>
        <Text style={s.secoes}>
          {me && me.sections.length > 0 ? me.sections.join(" · ") : "—"}
        </Text>
        <Text style={s.nota}>
          As áreas são definidas pela sua agência. O aplicativo mostra apenas o que o servidor libera.
        </Text>
      </View>

      <Pressable style={s.botaoNeutro} onPress={() => void recarregar()}>
        <Text style={s.botaoNeutroTexto}>Atualizar permissões</Text>
      </Pressable>

      <Pressable style={s.botaoSair} onPress={confirmarSaida} disabled={saindo}>
        <Text style={s.botaoSairTexto}>{saindo ? "Saindo…" : "Sair da conta"}</Text>
      </Pressable>

      <Pressable onPress={pedirExclusao}>
        <Text style={s.excluir}>Excluir conta</Text>
      </Pressable>
    </ScrollView>
  );
}

function Linha({ rotulo, valor, theme }: { rotulo: string; valor: string; theme: ReturnType<typeof buildTheme> }) {
  const s = styles(theme);
  return (
    <View style={s.linha}>
      <Text style={s.linhaRotulo}>{rotulo}</Text>
      <Text style={s.linhaValor} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    conteudo: { paddingHorizontal: 16, gap: 14 },
    marcaBox: { alignItems: "center", gap: 10, marginBottom: 8 },
    logo: { width: 90, height: 90, borderRadius: 18 },
    logoVazio: { width: 90, height: 90, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    logoLetra: { fontSize: 38, fontWeight: "800" },
    cliente: { fontSize: 20, fontWeight: "800", color: t.text },
    bloco: { backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 14, gap: 10 },
    linha: { flexDirection: "row", gap: 12 },
    linhaRotulo: { width: 76, fontSize: 13.5, color: t.muted },
    linhaValor: { flex: 1, fontSize: 14.5, color: t.text, fontWeight: "600" },
    secaoTitulo: { fontSize: 13, fontWeight: "700", color: t.muted, marginTop: 6, marginLeft: 4 },
    secoes: { fontSize: 14, color: t.text },
    nota: { fontSize: 12, color: t.muted, lineHeight: 17 },
    botaoNeutro: { borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 },
    botaoNeutroTexto: { color: t.text, fontWeight: "600", fontSize: 15 },
    botaoSair: { borderWidth: 1, borderColor: t.crit, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    botaoSairTexto: { color: t.crit, fontWeight: "700", fontSize: 15 },
    excluir: { color: t.muted, fontSize: 13, textAlign: "center", marginTop: 8, textDecorationLine: "underline" },
  });
