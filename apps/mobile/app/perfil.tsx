import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { DOCUMENTOS, urlDoDocumento } from "../src/config/legal";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import Constants from "expo-constants";
import { limparCacheDeMidia } from "../src/ui/media";
import { appEnv } from "../src/config/env";

export default function Perfil() {
  const { me, sair, base } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);
  const [saindo, setSaindo] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [permissao, setPermissao] = useState("Verificando…");

  const versao = `${Constants.expoConfig?.version ?? "—"}${appEnv() === "production" ? "" : ` · ${appEnv()}`}`;

  useEffect(() => {
    void Notifications.getPermissionsAsync()
      .then((p) => setPermissao(p.granted ? "Ativadas" : "Desativadas nos Ajustes"))
      .catch(() => setPermissao("—"));
  }, []);

  const limpar = () => {
    setLimpando(true);
    limparCacheDeMidia();
    // Sem rede envolvida: o retorno imediato pareceria um botão que não faz nada.
    setTimeout(() => setLimpando(false), 450);
  };

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
          // A folha é uma rota MODAL apresentada por cima da pilha. Se ela ficar
          // aberta, o redirecionamento do Guard para /vincular acontece ATRÁS
          // dela e o "Sair" parece não ter feito nada. Fecha primeiro.
          router.back();
          await sair();
          setSaindo(false);
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.tela} contentContainerStyle={[s.conteudo, { paddingBottom: insets.bottom + 32 }]}>
      <Stack.Screen
        options={{
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

      <Text style={s.secaoTitulo}>Este aparelho</Text>
      <View style={s.bloco}>
        <Linha rotulo="Notificações" valor={permissao} theme={theme} />
        <Linha rotulo="Aplicativo" valor={versao} theme={theme} />
      </View>

      <Pressable style={s.botaoNeutro} onPress={limpar} disabled={limpando}>
        <Text style={s.botaoNeutroTexto}>{limpando ? "Limpando…" : "Limpar fotos e áudios baixados"}</Text>
      </Pressable>
      <Text style={s.rodape}>
        Some do aparelho o que foi baixado das conversas. As mensagens continuam
        no servidor e voltam a carregar quando você abrir a conversa.
      </Text>

      <Text style={s.secaoTitulo}>Privacidade e termos</Text>
      <View style={s.bloco}>
        {DOCUMENTOS.map((d, i) => (
          <Pressable
            key={d.caminho}
            onPress={() => base && void Linking.openURL(urlDoDocumento(base, d.caminho))}
            disabled={!base}
            accessibilityRole="link"
            style={({ pressed }) => [s.documento, i > 0 && s.documentoSeparado, pressed && { opacity: 0.6 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.documentoTitulo}>{d.titulo}</Text>
              <Text style={s.documentoResumo}>{d.resumo}</Text>
            </View>
            <Simbolo nome={SIMBOLO.avancar as never} tamanho={13} cor={theme.muted} peso="semibold" />
          </Pressable>
        ))}
      </View>

      <Pressable style={s.botaoSair} onPress={confirmarSaida} disabled={saindo}>
        <Text style={s.botaoSairTexto}>{saindo ? "Saindo…" : "Sair da conta"}</Text>
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
    conteudo: { paddingHorizontal: 16, paddingTop: 24, gap: 14 },
    marcaBox: { alignItems: "center", gap: 12, marginBottom: 10 },
    logo: { width: 90, height: 90, borderRadius: 18 },
    logoVazio: { width: 90, height: 90, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    logoLetra: { fontSize: 38, fontWeight: "800" },
    cliente: { fontSize: 20, fontWeight: "800", color: t.text },
    bloco: { backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 14, gap: 10 },
    linha: { flexDirection: "row", gap: 12 },
    linhaRotulo: { width: 76, fontSize: 13.5, color: t.muted },
    linhaValor: { flex: 1, fontSize: 14.5, color: t.text, fontWeight: "600" },
    secaoTitulo: { fontSize: 13, fontWeight: "700", color: t.muted, marginTop: 6, marginLeft: 4 },
    botaoNeutro: { borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 },
    botaoNeutroTexto: { color: t.text, fontWeight: "600", fontSize: 15 },
    documento: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
    documentoSeparado: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, paddingTop: 12, marginTop: 8 },
    documentoTitulo: { fontSize: 15, fontWeight: "600", color: t.text },
    documentoResumo: { fontSize: 12, color: t.muted, marginTop: 2, lineHeight: 16 },
    botaoSair: { borderWidth: 1, borderColor: t.crit, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    botaoSairTexto: { color: t.crit, fontWeight: "700", fontSize: 15 },
    rodape: { color: t.muted, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: -6, marginBottom: 4, paddingHorizontal: 8 },
  });
