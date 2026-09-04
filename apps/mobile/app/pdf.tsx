// ── Visor de PDF do orçamento ─────────────────────────────────────────────────
// Antes: "Ver PDF" baixava o arquivo e entregava à folha de compartilhamento do
// iOS — o usuário saía do app para conferir um número. Agora o PDF abre AQUI,
// numa folha que sobe por cima da lista, e fecha arrastando.
//
// O PDF continua sendo gerado no SERVIDOR (lib/quote-pdf.ts, o mesmo do PWA e o
// mesmo que o cliente recebe). O aparelho só exibe.
//
// O arquivo é baixado com o Bearer e mostrado a partir do disco: no iOS os
// `headers` de um WebView valem só para a requisição de topo, e uma folha de
// PDF costuma pedir sub-recursos. Baixar primeiro remove essa incerteza — e
// reaproveita `pdfDoOrcamento`, que já é o caminho testado.

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import * as Sharing from "expo-sharing";
import { useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";
import { TIPO } from "../src/ui/tipografia";
import { ESP } from "../src/ui/forma";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import { pdfDoOrcamento } from "../src/ui/media";

export default function VisorPdf() {
  const { client, me } = useSession();
  const router = useRouter();
  const { quoteId, titulo } = useLocalSearchParams<{ quoteId?: string; titulo?: string }>();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  const [uri, setUri] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!client || !quoteId) { setErro("Orçamento não informado."); return; }
      try {
        const f = await pdfDoOrcamento(client, quoteId);
        if (vivo) setUri(f);
      } catch {
        if (vivo) setErro("Não foi possível carregar o PDF agora.");
      }
    })();
    return () => { vivo = false; };
  }, [client, quoteId]);

  // Compartilhar continua existindo — virou escolha, e não o único caminho.
  const compartilhar = useCallback(async () => {
    if (!uri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    }
  }, [uri]);

  return (
    <View style={s.tela}>
      <Stack.Screen
        options={{
          title: titulo ? `Orçamento ${titulo}` : "Orçamento",
          headerStyle: { backgroundColor: theme.surface },
          headerTitleStyle: { color: theme.text, fontSize: 16 },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={s.acao}>Fechar</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => void compartilhar()} hitSlop={10} disabled={!uri} accessibilityRole="button" accessibilityLabel="Compartilhar PDF">
              <Simbolo nome={SIMBOLO.compartilhar as never} tamanho={21} cor={uri ? theme.accent : theme.border} />
            </Pressable>
          ),
        }}
      />

      {erro ? (
        <View style={s.centro}><Text style={s.erro}>{erro}</Text></View>
      ) : !uri ? (
        <View style={s.centro}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <WebView
          source={{ uri }}
          style={s.web}
          originWhitelist={["file://", "about:"]}
          allowFileAccess
          allowFileAccessFromFileURLs
          // A folha do iOS já rola; deixar o WebView rolar também dá conflito de
          // gesto no topo. O PDF ajusta à largura e rola dentro dele mesmo.
          scalesPageToFit
          startInLoadingState
          renderLoading={() => (
            <View style={s.centro}><ActivityIndicator color={theme.accent} /></View>
          )}
        />
      )}
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    web: { flex: 1, backgroundColor: t.bg },
    centro: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
    erro: { ...TIPO.corpo, color: t.muted, textAlign: "center", paddingHorizontal: ESP.xxl },
    acao: { color: t.accent, fontSize: 16, fontWeight: "600" },
  });
