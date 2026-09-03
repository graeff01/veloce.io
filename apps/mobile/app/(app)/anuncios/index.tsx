import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Megaphone, TrendingDown, TrendingUp } from "lucide-react-native";
import { useSession } from "../../../src/ui/session";
import { buildTheme } from "../../../src/ui/theme";
import { ApiError } from "../../../src/core/errors";
import type { AdsPerformance } from "../../../src/core/contracts";

// ── Módulo ANÚNCIOS: desempenho de mídia ──────────────────────────────────────
// NÃO é o antigo "Anúncios" da barra do portal (aquele era um filtro de leads e
// virou filtro de campanha dentro de Conversas).
//
// Os números vêm de getClientAds — a MESMA função que a tela /anuncios do PWA
// usa —, exposta pela rota aditiva /api/portal/_session/ads. Web e app não podem
// divergir de número.

export default function Anuncios() {
  const { client, me } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  const [dados, setDados] = useState<AdsPerformance | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!client) return;
    try {
      setDados(await client.adsPerformance("month"));
      setErro(null);
    } catch (e) {
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar os anúncios.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [client]);

  useEffect(() => { void carregar(); }, [carregar]);

  const moeda = (v: number, c: string) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: c || "BRL", maximumFractionDigits: 0 });

  const verLeads = (campanha: string) =>
    router.push({ pathname: "/(app)/conversas", params: { campanha } });

  if (carregando) {
    return <View style={[s.tela, s.centro]}><ActivityIndicator color={theme.accent} /></View>;
  }

  return (
    <ScrollView
      style={s.tela}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      refreshControl={
        <RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar(); }} tintColor={theme.accent} />
      }
    >
      <Stack.Screen options={{ title: "Anúncios", headerLargeTitle: true }} />
      {dados?.periodLabel ? <Text style={s.periodo}>{dados.periodLabel}</Text> : null}

      {erro ? (
        <View style={s.erroCaixa}>
          <Text style={s.erroTexto}>{erro}</Text>
          <Pressable onPress={() => void carregar()}><Text style={s.tentar}>Tentar de novo</Text></Pressable>
        </View>
      ) : null}

      {dados && !dados.hasMeta ? (
        <Text style={s.vazio}>Nenhuma conta de anúncios conectada.</Text>
      ) : dados ? (
        <>
          <View style={s.metricas}>
            <Metrica rotulo="Investimento" valor={moeda(dados.spend, dados.currency)} delta={dados.deltas.spend} theme={theme} maiorEhMelhor={undefined} />
            <Metrica rotulo="Leads" valor={String(dados.leads)} delta={dados.deltas.leads} theme={theme} maiorEhMelhor />
            <Metrica rotulo="CPL" valor={dados.cpl == null ? "—" : moeda(dados.cpl, dados.currency)} delta={dados.deltas.cpl} theme={theme} maiorEhMelhor={false} />
          </View>

          <Text style={s.secao}>Campanhas</Text>

          {dados.topCampaigns.length === 0 ? (
            <Text style={s.vazio}>Nenhuma campanha com investimento no período.</Text>
          ) : (
            dados.topCampaigns.map((c) => (
              <View key={c.name} style={s.cartao}>
                {/* Peça do anúncio ao lado do nome: o número ganha rosto. */}
                <View style={s.campanhaTopo}>
                  {c.image ? (
                    <Image source={{ uri: c.image }} style={s.criativo} resizeMode="cover" />
                  ) : (
                    <View style={[s.criativo, s.criativoVazio]}>
                      <Megaphone size={18} color={theme.muted} strokeWidth={2} />
                    </View>
                  )}
                  <Text style={s.campanhaNome} numberOfLines={3}>{c.name}</Text>
                </View>
                <View style={s.linhaMetricas}>
                  <Coluna rotulo="Investimento" valor={moeda(c.spend, dados.currency)} theme={theme} />
                  <Coluna rotulo="Leads" valor={String(c.leads)} theme={theme} />
                  <Coluna rotulo="CPL" valor={c.cpl == null ? "—" : moeda(c.cpl, dados.currency)} theme={theme} />
                </View>
                <Pressable onPress={() => verLeads(c.name)} style={s.verLeads} accessibilityRole="button">
                  <Text style={s.verLeadsTexto}>Ver leads</Text>
                </Pressable>
              </View>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Metrica({ rotulo, valor, delta, theme, maiorEhMelhor }: {
  rotulo: string; valor: string; delta: number | null;
  theme: ReturnType<typeof buildTheme>; maiorEhMelhor?: boolean;
}) {
  const s = styles(theme);
  const sobe = (delta ?? 0) >= 0;
  const cor = delta == null || maiorEhMelhor === undefined
    ? theme.muted
    : sobe === maiorEhMelhor ? theme.good : theme.crit;
  const Icone = sobe ? TrendingUp : TrendingDown;

  return (
    <View style={s.metrica}>
      <Text style={s.metricaRotulo}>{rotulo}</Text>
      <Text style={s.metricaValor} maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      {delta == null ? (
        <Text style={s.metricaDelta}>—</Text>
      ) : (
        <View style={s.deltaLinha}>
          <Icone size={11} color={cor} strokeWidth={2.6} />
          <Text style={[s.metricaDelta, { color: cor }]}>{sobe ? "+" : ""}{delta}%</Text>
        </View>
      )}
    </View>
  );
}

function Coluna({ rotulo, valor, theme }: { rotulo: string; valor: string; theme: ReturnType<typeof buildTheme> }) {
  const s = styles(theme);
  return (
    <View style={s.coluna}>
      <Text style={s.colunaRotulo}>{rotulo}</Text>
      <Text style={s.colunaValor} maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    centro: { alignItems: "center", justifyContent: "center" },
    periodo: { fontSize: 13, color: t.muted, marginHorizontal: 16, marginBottom: 6 },

    metricas: { flexDirection: "row", backgroundColor: t.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    metrica: { flex: 1, padding: 14, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.border },
    metricaRotulo: { fontSize: 11, fontWeight: "600", color: t.muted },
    metricaValor: { fontSize: 20, fontWeight: "800", color: t.text, marginTop: 6, letterSpacing: -0.5 },
    deltaLinha: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 5 },
    metricaDelta: { fontSize: 11, fontWeight: "700", color: t.muted, marginTop: 5 },

    secao: { fontSize: 11, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase", color: t.muted, margin: 16, marginBottom: 8 },
    cartao: {
      backgroundColor: t.surface, marginHorizontal: 16, marginBottom: 10, borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: 14, gap: 10,
    },
    campanhaTopo: { flexDirection: "row", alignItems: "center", gap: 12 },
    criativo: { width: 64, height: 64, borderRadius: 10, backgroundColor: t.raise },
    criativoVazio: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.border },
    campanhaNome: { flex: 1, fontSize: 15.5, fontWeight: "700", color: t.text, lineHeight: 20 },
    linhaMetricas: { flexDirection: "row", gap: 14 },
    coluna: { flex: 1 },
    colunaRotulo: { fontSize: 10.5, fontWeight: "600", color: t.muted },
    colunaValor: { fontSize: 15, fontWeight: "700", color: t.text, marginTop: 2 },
    verLeads: { alignSelf: "flex-start", borderRadius: 10, borderWidth: 1, borderColor: t.accent, paddingHorizontal: 14, paddingVertical: 7 },
    verLeadsTexto: { color: t.accent, fontSize: 13, fontWeight: "700" },

    vazio: { color: t.muted, fontSize: 14.5, textAlign: "center", padding: 32 },
    erroCaixa: { padding: 14, backgroundColor: t.critSoft, gap: 4 },
    erroTexto: { color: t.crit, fontSize: 13 },
    tentar: { color: t.accent, fontSize: 13, fontWeight: "700" },
  });
