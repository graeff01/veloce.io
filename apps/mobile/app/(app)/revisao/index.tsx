import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { TIPO } from "../../../src/ui/tipografia";
import * as Sharing from "expo-sharing";
import { useSession } from "../../../src/ui/session";
import { buildTheme } from "../../../src/ui/theme";
import { pdfDoOrcamento } from "../../../src/ui/media";
import { ApiError } from "../../../src/core/errors";
import type { QuoteReview } from "../../../src/core/contracts";

// ── Revisão de orçamento ──────────────────────────────────────────────────────
// O PDF continua sendo gerado no SERVIDOR (lib/quote-pdf.ts, mesmo layout que a
// IA usa). O app baixa os bytes com a credencial e abre no visualizador nativo —
// nada de reimplementar geração de PDF no aparelho.

export default function Revisao() {
  const { client, me } = useSession();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  const [itens, setItens] = useState<QuoteReview[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!client) return;
    try {
      setItens(await client.quoteReviews());
      setErro(null);
    } catch (e) {
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar as revisões.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [client]);

  useEffect(() => { void carregar(); }, [carregar]);

  const decidir = useCallback((q: QuoteReview, aprovar: boolean) => {
    Alert.alert(
      aprovar ? "Aprovar orçamento" : "Rejeitar orçamento",
      aprovar
        ? `O orçamento ${q.number ?? ""} será enviado ao lead ${q.name}.`
        : `O orçamento ${q.number ?? ""} não será enviado.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: aprovar ? "Aprovar e enviar" : "Rejeitar",
          style: aprovar ? "default" : "destructive",
          onPress: async () => {
            if (!client) return;
            setOcupado(q.quoteId);
            try {
              if (aprovar) await client.approveQuote(q.quoteId);
              else await client.rejectQuote(q.quoteId);
              setItens((antes) => antes.filter((i) => i.quoteId !== q.quoteId));
            } catch (e) {
              Alert.alert("Não deu", e instanceof ApiError ? e.message : "Tente de novo.");
            } finally {
              setOcupado(null);
            }
          },
        },
      ],
    );
  }, [client]);

  const abrirPdf = useCallback(async (q: QuoteReview) => {
    if (!client) return;
    setOcupado(q.quoteId);
    try {
      const uri = await pdfDoOrcamento(client, q.quoteId);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch {
      Alert.alert("PDF indisponível", "Não foi possível abrir o orçamento agora.");
    } finally {
      setOcupado(null);
    }
  }, [client]);

  const moeda = (v: number | null, c: string) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: c || "BRL" });

  if (carregando) {
    return <View style={[s.tela, s.centro]}><ActivityIndicator color={theme.accent} /></View>;
  }

  return (
    <View style={s.tela}>
      <Stack.Screen options={{ title: "Revisão", headerLargeTitle: true }} />

      {erro ? <Text style={s.erro}>{erro}</Text> : null}

      <FlatList
        data={itens}
        keyExtractor={(q) => q.quoteId}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <Text style={s.sub}>{itens.length === 0 ? "Nada pendente" : `${itens.length} aguardando você`}</Text>
        }
        contentContainerStyle={itens.length === 0 ? s.vazioBox : { padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={<Text style={s.vazio}>Nenhum orçamento aguardando revisão.</Text>}
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar(); }} tintColor={theme.accent} />
        }
        renderItem={({ item }) => (
          <View style={s.cartao}>
            <View style={s.cartaoTopo}>
              <Text style={s.lead} numberOfLines={1}>{item.name}</Text>
              <Text style={s.total}>{moeda(item.total, item.currency)}</Text>
            </View>
            {item.number ? <Text style={s.numero}>Orçamento {item.number}</Text> : null}
            {item.resumo ? <Text style={s.resumo}>{item.resumo}</Text> : null}
            {item.city ? <Text style={s.resumo}>Entrega: {item.city}</Text> : null}

            {item.lines.slice(0, 4).map((l, i) => (
              <View key={`${item.quoteId}-${i}`} style={s.linhaItem}>
                <Text style={s.linhaLabel} numberOfLines={1}>{l.label}</Text>
                <Text style={s.linhaValor}>{moeda(l.amount, item.currency)}</Text>
              </View>
            ))}

            <View style={s.acoes}>
              <Pressable style={s.botaoNeutro} onPress={() => void abrirPdf(item)} disabled={ocupado === item.quoteId}>
                <Text style={s.botaoNeutroTexto}>Ver PDF</Text>
              </Pressable>
              <Pressable style={s.botaoRejeitar} onPress={() => decidir(item, false)} disabled={ocupado === item.quoteId}>
                <Text style={s.botaoRejeitarTexto}>Rejeitar</Text>
              </Pressable>
              <Pressable style={s.botaoAprovar} onPress={() => decidir(item, true)} disabled={ocupado === item.quoteId}>
                {ocupado === item.quoteId
                  ? <ActivityIndicator color={theme.onAccent} />
                  : <Text style={s.botaoAprovarTexto}>Aprovar</Text>}
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    centro: { alignItems: "center", justifyContent: "center" },
    cabecalho: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border },
    titulo: { fontSize: 24, fontWeight: "800", color: t.text, marginTop: 6 },
    sub: { fontSize: 13, color: t.muted, marginTop: 2 },
    cartao: { backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 14, gap: 6 },
    cartaoTopo: { flexDirection: "row", alignItems: "center", gap: 10 },
    lead: { ...TIPO.destaque, flex: 1, color: t.text },
    total: { ...TIPO.destaque, fontWeight: "700", color: t.accent, fontVariant: ["tabular-nums"] },
    numero: { ...TIPO.nota, color: t.muted },
    resumo: { ...TIPO.nota, color: t.muted },
    linhaItem: { flexDirection: "row", gap: 8, marginTop: 2 },
    linhaLabel: { ...TIPO.subtitulo, flex: 1, color: t.text },
    linhaValor: { ...TIPO.subtitulo, color: t.muted, fontVariant: ["tabular-nums"] },
    acoes: { flexDirection: "row", gap: 8, marginTop: 10 },
    botaoNeutro: { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
    botaoNeutroTexto: { ...TIPO.subtitulo, color: t.text, fontWeight: "500" },
    botaoRejeitar: { flex: 1, borderWidth: 1, borderColor: t.crit, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
    botaoRejeitarTexto: { ...TIPO.subtitulo, color: t.crit, fontWeight: "500" },
    botaoAprovar: { flex: 1.2, backgroundColor: t.accent, borderRadius: 10, paddingVertical: 11, alignItems: "center", justifyContent: "center", minHeight: 42 },
    botaoAprovarTexto: { ...TIPO.subtitulo, color: t.onAccent, fontWeight: "600" },
    vazioBox: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    vazio: { ...TIPO.corpo, color: t.muted, textAlign: "center" },
    erro: { color: t.crit, fontSize: 13, padding: 16 },
  });
