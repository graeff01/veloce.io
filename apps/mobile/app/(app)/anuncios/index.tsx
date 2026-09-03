import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { SIMBOLO, Simbolo } from "../../../src/ui/simbolo";
import { CABECALHO_SECAO, TIPO } from "../../../src/ui/tipografia";
import { CURVA, ESP, RAIO, cartao } from "../../../src/ui/forma";
import Animated, { FadeInDown } from "react-native-reanimated";
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
            dados.topCampaigns.map((c, i) => (
              <Animated.View key={c.name} style={s.cartao} entering={FadeInDown.duration(240).delay(i * 60)}>
                {/* Peça do anúncio ao lado do nome: o número ganha rosto. */}
                <View style={s.campanhaTopo}>
                  {c.image ? (
                    <Image source={{ uri: c.image }} style={s.criativo} resizeMode="cover" />
                  ) : (
                    <View style={[s.criativo, s.criativoVazio]}>
                      <Simbolo nome={SIMBOLO.semAnuncio as never} tamanho={22} cor={theme.muted} />
                    </View>
                  )}
                  <Text style={s.campanhaNome} numberOfLines={3}>{c.name}</Text>
                </View>
                <View style={s.linhaMetricas}>
                  <Coluna rotulo="Investimento" valor={moeda(c.spend, dados.currency)} theme={theme} />
                  <Coluna rotulo="Leads" valor={String(c.leads)} theme={theme} />
                  <Coluna rotulo="CPL" valor={c.cpl == null ? "—" : moeda(c.cpl, dados.currency)} theme={theme} />
                </View>
                <Pressable
                  onPress={() => verLeads(c.name)}
                  style={({ pressed }) => [s.verLeads, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.verLeadsTexto}>Ver leads</Text>
                </Pressable>
              </Animated.View>
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
  const simbolo = sobe ? SIMBOLO.subindo : SIMBOLO.descendo;

  return (
    <View style={s.metrica}>
      <Text style={s.metricaRotulo}>{rotulo}</Text>
      <Text style={s.metricaValor} maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      {delta == null ? (
        <Text style={s.metricaDelta}>—</Text>
      ) : (
        <View style={s.deltaLinha}>
          <Simbolo nome={simbolo as never} tamanho={11} cor={cor} peso="bold" />
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
    periodo: { ...TIPO.nota, color: t.muted, marginHorizontal: 16, marginBottom: 6 },

    metricas: { flexDirection: "row", backgroundColor: t.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    metrica: { flex: 1, padding: ESP.gutter, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.border },
    metricaRotulo: { ...TIPO.legenda, fontWeight: "500", color: t.muted },
    metricaValor: { ...TIPO.titulo3, fontWeight: "700", color: t.text, marginTop: 5, fontVariant: ["tabular-nums"] },
    deltaLinha: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 5 },
    metricaDelta: { ...TIPO.legenda2, fontWeight: "600", color: t.muted, marginTop: 5 },

    secao: { ...CABECALHO_SECAO, color: t.muted, marginHorizontal: 32, marginTop: 24, marginBottom: 7 },
    cartao: { ...cartao(t.surface), marginHorizontal: ESP.gutter, marginBottom: ESP.md, padding: ESP.gutter, gap: ESP.md },
    campanhaTopo: { flexDirection: "row", alignItems: "center", gap: 12 },
    criativo: { width: 68, height: 68, borderRadius: RAIO.peq, ...CURVA, backgroundColor: t.raise },
    criativoVazio: { alignItems: "center", justifyContent: "center" },
    campanhaNome: { ...TIPO.destaque, flex: 1, color: t.text },
    linhaMetricas: { flexDirection: "row", gap: 14 },
    coluna: { flex: 1 },
    colunaRotulo: { ...TIPO.legenda2, fontWeight: "500", color: t.muted },
    colunaValor: { ...TIPO.subtitulo, fontWeight: "600", color: t.text, marginTop: 2, fontVariant: ["tabular-nums"] },
    verLeads: { alignSelf: "flex-start", borderRadius: RAIO.pilula, backgroundColor: t.accentSoft, paddingHorizontal: ESP.gutter, paddingVertical: 8 },
    verLeadsTexto: { ...TIPO.nota, color: t.accent, fontWeight: "600" },

    vazio: { ...TIPO.corpo, color: t.muted, textAlign: "center", padding: 32 },
    erroCaixa: { padding: 14, backgroundColor: t.critSoft, gap: 4 },
    erroTexto: { color: t.crit, fontSize: 13 },
    tentar: { color: t.accent, fontSize: 13, fontWeight: "700" },
  });
