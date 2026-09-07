import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, AppState, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, useWindowDimensions, View,
} from "react-native";
import { useEscuro } from "../../../src/ui/aparencia";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { SIMBOLO, Simbolo } from "../../../src/ui/simbolo";
import { CABECALHO_SECAO, TIPO } from "../../../src/ui/tipografia";
import { CURVA, ESP, ESPACO_BARRA, RAIO, cartao } from "../../../src/ui/forma";
import Animated, { FadeInDown } from "react-native-reanimated";
import { NumeroAnimado } from "../../../src/ui/numero";
import { Sparkline } from "../../../src/ui/sparkline";
import { useSession } from "../../../src/ui/session";
import { BotaoMais } from "../../../src/ui/botao-mais";
import { useTema } from "../../../src/ui/tema";
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
  const { width: larguraTela } = useWindowDimensions();
  const larguraGrafico = Math.max(120, larguraTela - ESP.gutter * 2 - ESP.lg * 2);
  const theme = useTema();
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

  // "Vivo enquanto a aba está aberta": os números se atualizam sozinhos a cada
  // 60s, com o app em primeiro plano. O ponto pulsando na ponta da linha é o
  // sinal disso — não é enfeite, é o estado real do dado.
  useFocusEffect(useCallback(() => {
    const id = setInterval(() => {
      if (AppState.currentState === "active") void carregar();
    }, 60_000);
    return () => clearInterval(id);
  }, [carregar]));

  const moeda = (v: number, c: string) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: c || "BRL", maximumFractionDigits: 0 });

  const verLeads = (campanha: string) =>
    router.push({ pathname: "/(app)/conversas", params: { campanha } });

  return (
    <>
    <Stack.Screen options={{ title: "Anúncios", headerLeft: () => <BotaoMais /> }} />
    <ScrollView
      style={s.tela}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: insets.bottom + ESPACO_BARRA }}
      refreshControl={
        <RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar(); }} tintColor={theme.accent} />
      }
    >
      {dados?.periodLabel ? <Text style={s.periodo}>{dados.periodLabel}</Text> : null}

      {erro ? (
        <View style={s.erroCaixa}>
          <Text style={s.erroTexto}>{erro}</Text>
          <Pressable onPress={() => void carregar()}><Text style={s.tentar}>Tentar de novo</Text></Pressable>
        </View>
      ) : null}

      {dados && !dados.hasMeta ? (
        <Animated.View style={s.vazioBox} entering={FadeInDown.duration(300)}>
          <View style={s.vazioIcone}>
            <Simbolo nome={SIMBOLO.semAnuncio as never} tamanho={40} cor={theme.muted} />
          </View>
          <Text style={s.vazioTitulo}>Anúncios ainda não conectados</Text>
          <Text style={s.vazioTexto}>
            Quando sua agência conectar a conta de anúncios, aparecem aqui o
            investimento, os leads que cada campanha trouxe e o custo por lead.
          </Text>
        </Animated.View>
      ) : dados ? (
        <>
          {/* Investimento é o número que o dono da loja procura primeiro, então
              ele domina; leads e CPL ficam abaixo, lendo-se como consequência.
              Três colunas de mesmo peso não diziam o que olhar primeiro. */}
          <Animated.View style={s.heroi} entering={FadeInDown.duration(320)}>
            <View style={s.heroiTopo}>
              <Text style={s.heroiRotulo}>Investimento</Text>
              <Delta valor={dados.deltas.spend} maiorEhMelhor={undefined} theme={theme} />
            </View>
            <NumeroAnimado
              valor={dados.spend}
              moeda
              prefixo={dados.currency === "BRL" ? "R$ " : ""}
              estilo={s.heroiValor}
            />
            <View style={s.grafico}>
              <Sparkline
                valores={dados.series.map((p: { spend: number }) => p.spend)}
                cor={theme.accent}
                largura={larguraGrafico}
              />
            </View>
          </Animated.View>

          <View style={s.duplas}>
            <Animated.View style={s.dupla} entering={FadeInDown.duration(320).delay(90)}>
              <Text style={s.duplaRotulo}>Leads</Text>
              <NumeroAnimado valor={dados.leads} estilo={s.duplaValor} duracao={700} />
              <Delta valor={dados.deltas.leads} maiorEhMelhor theme={theme} />
            </Animated.View>
            <Animated.View style={s.dupla} entering={FadeInDown.duration(320).delay(150)}>
              <Text style={s.duplaRotulo}>Custo por lead</Text>
              {dados.cpl == null ? (
                <Text style={s.duplaValor}>—</Text>
              ) : (
                <NumeroAnimado
                  valor={dados.cpl}
                  moeda
                  prefixo={dados.currency === "BRL" ? "R$ " : ""}
                  estilo={s.duplaValor}
                  duracao={700}
                />
              )}
              <Delta valor={dados.deltas.cpl} maiorEhMelhor={false} theme={theme} />
            </Animated.View>
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
                  <View style={s.campanhaCorpo}>
                    <Text style={s.campanhaNome} numberOfLines={2}>{c.name}</Text>
                    {/* Fatia do investimento: "onde o dinheiro está indo" sem
                        obrigar ninguém a fazer conta de cabeça. */}
                    <View style={s.fatiaTrilha}>
                      <View style={[s.fatiaCheia, { width: `${Math.max(3, c.pctSpend)}%`, backgroundColor: theme.accent }]} />
                    </View>
                    <Text style={s.fatiaTexto}>{c.pctSpend}% do investimento</Text>
                  </View>
                </View>

                {/* Faixa própria, fundo recuado e divisores entre os números:
                    separa "o que é" de "quanto deu". Antes os três boiavam no
                    mesmo fundo do nome, sem nada os agrupando. */}
                <View style={s.faixaMetricas}>
                  <Coluna rotulo="Investimento" valor={moeda(c.spend, dados.currency)} theme={theme} />
                  <View style={s.divisorVertical} />
                  <Coluna rotulo="Leads" valor={String(c.leads)} theme={theme} />
                  <View style={s.divisorVertical} />
                  <Coluna
                    rotulo="Custo por lead"
                    valor={c.cpl == null ? "—" : moeda(c.cpl, dados.currency)}
                    theme={theme}
                    apagado={c.cpl == null}
                  />
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
      ) : carregando ? (
        <View style={s.centro}><ActivityIndicator color={theme.accent} /></View>
      ) : null}
    </ScrollView>
    </>
  );
}

/**
 * Variação contra o MESMO número de dias do mês anterior. `maiorEhMelhor`
 * decide a cor: subir o CPL é ruim, subir os leads é bom, e o investimento não
 * é nem uma coisa nem outra — fica neutro.
 */
function Delta({ valor, maiorEhMelhor, theme }: {
  valor: number | null; maiorEhMelhor?: boolean; theme: ReturnType<typeof buildTheme>;
}) {
  const s = styles(theme);
  if (valor == null) return <Text style={s.deltaVazio}>sem comparação</Text>;
  const sobe = valor >= 0;
  const cor = maiorEhMelhor === undefined ? theme.muted : sobe === maiorEhMelhor ? theme.good : theme.crit;
  return (
    <View style={[s.deltaLinha, { backgroundColor: `${cor}1A` }]}>
      <Simbolo nome={(sobe ? SIMBOLO.subindo : SIMBOLO.descendo) as never} tamanho={10} cor={cor} peso="bold" />
      <Text style={[s.deltaTexto, { color: cor }]} maxFontSizeMultiplier={1.2}>{sobe ? "+" : ""}{valor}%</Text>
    </View>
  );
}

function Coluna({ rotulo, valor, theme, apagado }: {
  rotulo: string; valor: string; theme: ReturnType<typeof buildTheme>; apagado?: boolean;
}) {
  const s = styles(theme);
  return (
    <View style={s.coluna}>
      <Text style={s.colunaRotulo} numberOfLines={1}>{rotulo}</Text>
      <Text
        style={[s.colunaValor, apagado && { color: theme.muted }]}
        maxFontSizeMultiplier={1.4}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {valor}
      </Text>
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    centro: { alignItems: "center", justifyContent: "center" },
    periodo: { ...TIPO.nota, color: t.muted, marginHorizontal: 16, marginBottom: 6 },

    heroi: { ...cartao(t.surface), marginHorizontal: ESP.gutter, marginBottom: ESP.md, padding: ESP.lg, gap: ESP.xs },
    heroiTopo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heroiRotulo: { ...TIPO.subtitulo, color: t.muted, fontWeight: "600" },
    heroiValor: { ...TIPO.tituloGrande, color: t.text, fontVariant: ["tabular-nums"], letterSpacing: -1 },
    grafico: { marginTop: ESP.sm, marginHorizontal: -4 },

    duplas: { flexDirection: "row", gap: ESP.md, marginHorizontal: ESP.gutter, marginBottom: ESP.sm },
    dupla: { ...cartao(t.surface), flex: 1, padding: ESP.gutter, gap: 3, alignItems: "flex-start" },
    duplaRotulo: { ...TIPO.legenda, color: t.muted, fontWeight: "600" },
    duplaValor: { ...TIPO.titulo2, fontWeight: "700", color: t.text, fontVariant: ["tabular-nums"], marginBottom: 2 },
    deltaVazio: { ...TIPO.legenda2, color: t.muted },
    deltaTexto: { ...TIPO.legenda2, fontWeight: "800" },
    deltaLinha: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: RAIO.pilula, marginTop: 2 },

    secao: { ...CABECALHO_SECAO, color: t.muted, marginHorizontal: 32, marginTop: 24, marginBottom: 7 },
    cartao: { ...cartao(t.surface), marginHorizontal: ESP.gutter, marginBottom: ESP.md, padding: ESP.gutter, gap: ESP.md },
    campanhaTopo: { flexDirection: "row", alignItems: "center", gap: 12 },
    criativo: { width: 84, height: 84, borderRadius: RAIO.medio, ...CURVA, backgroundColor: t.raise },
    campanhaCorpo: { flex: 1, gap: 6 },
    fatiaTrilha: { height: 5, borderRadius: 3, backgroundColor: t.raise, overflow: "hidden" },
    fatiaCheia: { height: 5, borderRadius: 3 },
    fatiaTexto: { ...TIPO.legenda2, color: t.muted },

    // Faixa própria, com fundo recuado: separa "o que é" de "quanto deu".
    faixaMetricas: {
      flexDirection: "row", alignItems: "stretch",
      backgroundColor: t.bg, borderRadius: RAIO.peq, ...CURVA,
      paddingVertical: ESP.md, marginTop: ESP.xs,
    },
    divisorVertical: { width: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 2 },
    criativoVazio: { alignItems: "center", justifyContent: "center" },
    campanhaNome: { ...TIPO.destaque, flex: 1, color: t.text },
    coluna: { flex: 1 },
    colunaRotulo: { ...TIPO.legenda2, fontWeight: "500", color: t.muted },
    colunaValor: { ...TIPO.subtitulo, fontWeight: "600", color: t.text, marginTop: 2, fontVariant: ["tabular-nums"] },
    verLeads: { alignSelf: "flex-start", borderRadius: RAIO.pilula, backgroundColor: t.accentSoft, paddingHorizontal: ESP.gutter, paddingVertical: 8 },
    verLeadsTexto: { ...TIPO.nota, color: t.accent, fontWeight: "600" },

    vazioBox: { alignItems: "center", gap: ESP.md, paddingHorizontal: ESP.xl, paddingTop: ESP.xxl },
    vazioIcone: {
      width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center",
      backgroundColor: t.raise,
    },
    vazioTitulo: { ...TIPO.titulo3, color: t.text, textAlign: "center" },
    vazioTexto: { ...TIPO.subtitulo, color: t.muted, textAlign: "center", lineHeight: 21 },
    vazio: { ...TIPO.corpo, color: t.muted, textAlign: "center", padding: 32 },
    erroCaixa: { padding: 14, backgroundColor: t.critSoft, gap: 4 },
    erroTexto: { color: t.crit, fontSize: 13 },
    tentar: { color: t.accent, fontSize: 13, fontWeight: "700" },
  });
