// ── Funil ─────────────────────────────────────────────────────────────────────
// Onde cada lead está no caminho até a venda. Monta a partir das MESMAS
// conversas que a caixa de entrada carrega — o portal web também deriva daí, e
// não existe rota de funil no backend para consumir.
//
// A etapa vem do `funnelStage` que a IA e a equipe mantêm; tocar num lead abre
// a conversa, que é onde a etapa se muda (folha de ações).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from "react-native";
import { useEscuro } from "../../../src/ui/aparencia";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSession } from "../../../src/ui/session";
import { BotaoMais } from "../../../src/ui/botao-mais";
import { useTema } from "../../../src/ui/tema";
import { avatarColor, buildTheme, STAGE } from "../../../src/ui/theme";
import { CABECALHO_SECAO, TIPO } from "../../../src/ui/tipografia";
import { CURVA, ESP, ESPACO_BARRA, RAIO, cartao } from "../../../src/ui/forma";
import { ApiError } from "../../../src/core/errors";
import type { ConversationRow } from "../../../src/core/contracts";

/** Ordem do caminho, não alfabética: é assim que o lead avança. */
const ORDEM = ["recebido", "respondido", "qualificado", "negociacao", "convertido", "perdido"] as const;

/**
 * A barra em si. Um degradê horizontal com duas paradas por etapa, e um brilho
 * que atravessa devagar — o "líquido" vem daí, não de trocar as cores.
 */
function BarraFunil({ paradas }: { paradas: { deslocamento: number; cor: string }[] }) {
  if (paradas.length === 0) return null;
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id="funil" x1="0" y1="0" x2="1" y2="0">
          {paradas.map((p, i) => (
            <Stop key={i} offset={Math.min(1, Math.max(0, p.deslocamento))} stopColor={p.cor} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#funil)" />
    </Svg>
  );
}

/**
 * Halo que respira EM VOLTA da barra. Antes o brilho passava por dentro e
 * competia com as cores, atrapalhando justamente a leitura das proporções.
 * Aqui ele só envolve: perceptível no canto do olho, ausente quando se lê.
 */
function HaloBarra({ cor, children }: { cor: string; children: React.ReactNode }) {
  const respiro = useSharedValue(0.18);
  useEffect(() => {
    respiro.value = withRepeat(
      withTiming(0.55, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true,
    );
  }, [respiro]);
  const halo = useAnimatedStyle(() => ({ shadowOpacity: respiro.value }));

  return (
    <Animated.View
      style={[
        { shadowColor: cor, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
        halo,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const PAGINA = 200;

export default function Funil() {
  const { client, me } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTema();
  const s = styles(theme);

  const [linhas, setLinhas] = useState<ConversationRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!client) return;
    try {
      const r = await client.conversations({ limit: PAGINA, offset: 0 });
      setLinhas(r.conversations);
      setErro(null);
    } catch (e) {
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar o funil.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [client]);

  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));

  const etapas = useMemo(() => {
    const por = new Map<string, ConversationRow[]>();
    for (const c of linhas) {
      const e = c.funnelStage && STAGE[c.funnelStage] ? c.funnelStage : "recebido";
      const lista = por.get(e) ?? [];
      lista.push(c);
      por.set(e, lista);
    }
    const total = linhas.length || 1;
    return ORDEM.map((chave) => {
      const leads = por.get(chave) ?? [];
      return {
        chave,
        rotulo: STAGE[chave]!.label,
        cor: STAGE[chave]!.color,
        leads,
        // Proporção sobre o total carregado — é a leitura que interessa: onde
        // o funil está entupido.
        fracao: leads.length / total,
      };
    });
  }, [linhas]);

  /**
   * Paradas do degradê. Cada etapa recebe DUAS: uma no início e outra no fim do
   * seu trecho, com a mesma cor — assim o miolo fica sólido e só a fronteira
   * mistura. Sem isso, um degradê simples borraria a etapa inteira e ninguém
   * conseguiria ler a proporção.
   */
  const paradas = useMemo(() => {
    const visiveis = etapas.filter((e) => e.leads.length > 0);
    const total = visiveis.reduce((n, e) => n + e.leads.length, 0) || 1;
    const out: { deslocamento: number; cor: string }[] = [];
    let acumulado = 0;
    for (const e of visiveis) {
      const largura = e.leads.length / total;
      // A borda de mistura ocupa no máximo 6% da barra — o suficiente para o
      // olho ler "derrete", pouco o bastante para não comer a etapa curta.
      const mistura = Math.min(0.06, largura / 2);
      out.push({ deslocamento: acumulado + mistura, cor: e.cor });
      acumulado += largura;
      out.push({ deslocamento: acumulado - mistura, cor: e.cor });
    }
    return out;
  }, [etapas]);

  /** O halo toma a cor da etapa com mais leads — o assunto do momento. */
  const corDominante = useMemo(() => {
    const maior = etapas.reduce((a, b) => (b.leads.length > a.leads.length ? b : a), etapas[0]!);
    return maior?.cor ?? theme.accent;
  }, [etapas, theme.accent]);

  const rotuloDaBarra = useMemo(
    () => etapas.filter((e) => e.leads.length > 0).map((e) => `${e.rotulo}: ${e.leads.length}`).join(", "),
    [etapas],
  );

  const abrirLead = useCallback((c: ConversationRow) => {
    router.push({
      pathname: "/(app)/conversas/[contactId]",
      params: { contactId: c.contactId, nome: c.name },
    });
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ title: "Funil", headerLeft: () => <BotaoMais /> }} />
      <FlatList
        style={s.tela}
        data={etapas}
        keyExtractor={(e) => e.chave}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: ESP.gutter, gap: ESP.md, paddingBottom: insets.bottom + ESPACO_BARRA }}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => { setAtualizando(true); void carregar(); }}
            tintColor={theme.accent}
          />
        }
        ListHeaderComponent={
          <>
            {erro ? <Text style={s.erro}>{erro}</Text> : null}
            {/* Barra do funil inteiro: uma faixa por etapa, proporcional. Dá em
                um olhar o que a lista abaixo dá em seis — onde está a massa. */}
            <Animated.View style={s.painel} entering={FadeInDown.duration(280)}>
              <View style={s.totalLinha}>
                <Text style={s.totalNumero}>{linhas.length}</Text>
                <Text style={s.totalRotulo}>
                  {carregando ? "carregando…" : linhas.length === 1 ? "conversa no funil" : "conversas no funil"}
                </Text>
              </View>

              <HaloBarra cor={corDominante}>
                <View style={s.barra} accessibilityLabel={rotuloDaBarra}>
                  <BarraFunil paradas={paradas} />
                </View>
              </HaloBarra>

              <View style={s.legenda}>
                {etapas.filter((e) => e.leads.length > 0).map((e) => (
                  <View key={e.chave} style={s.legendaItem}>
                    <View style={[s.legendaPonto, { backgroundColor: e.cor }]} />
                    <Text style={s.legendaTexto} numberOfLines={1}>
                      {e.rotulo} <Text style={s.legendaNumero}>{e.leads.length}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </>
        }
        ListEmptyComponent={
          carregando ? <ActivityIndicator color={theme.accent} style={{ marginTop: ESP.xxl }} /> : null
        }
        renderItem={({ item, index }) => {
          const expandida = aberta === item.chave;
          return (
            <Animated.View style={s.cartao} entering={FadeInDown.duration(240).delay(Math.min(index, 5) * 50)}>
              <Pressable
                onPress={() => setAberta(expandida ? null : item.chave)}
                accessibilityRole="button"
                accessibilityState={{ expanded: expandida }}
                style={({ pressed }) => [s.topo, pressed && { opacity: 0.6 }]}
              >
                <View style={[s.marca, { backgroundColor: item.cor }]} />
                <Text style={s.etapa}>{item.rotulo}</Text>
                <Text style={[s.contagem, { color: item.cor }]}>{item.leads.length}</Text>
              </Pressable>

              {/* A barra é a leitura de relance: onde o funil engrossa. */}
              <View style={s.trilha}>
                <View style={[s.preenchida, { backgroundColor: item.cor, width: `${Math.round(item.fracao * 100)}%` }]} />
              </View>

              {expandida && item.leads.length > 0 ? (
                <View style={s.leads}>
                  {item.leads.slice(0, 12).map((c) => (
                    <Pressable
                      key={c.contactId}
                      onPress={() => abrirLead(c)}
                      style={({ pressed }) => [s.lead, pressed && { backgroundColor: theme.raise }]}
                      accessibilityRole="button"
                    >
                      <View style={[s.avatar, { backgroundColor: avatarColor(c.name) }]}>
                        <Text style={s.avatarTexto}>{(c.name || "?").charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={s.leadNome} numberOfLines={1}>{c.name}</Text>
                    </Pressable>
                  ))}
                  {item.leads.length > 12 ? (
                    <Text style={s.maisLeads}>e mais {item.leads.length - 12}</Text>
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          );
        }}
      />
    </>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    painel: { ...cartao(t.surface), padding: ESP.gutter, gap: ESP.md, marginBottom: ESP.xs },
    totalLinha: { flexDirection: "row", alignItems: "baseline", gap: ESP.sm },
    totalNumero: { ...TIPO.tituloGrande, color: t.text, fontVariant: ["tabular-nums"], letterSpacing: -1 },
    totalRotulo: { ...TIPO.subtitulo, color: t.muted },
    // Uma faixa contínua: cada etapa ocupa o espaço proporcional ao que tem.
    barra: { flexDirection: "row", height: 10, borderRadius: 5, ...CURVA, overflow: "hidden", backgroundColor: t.raise },
    legenda: { flexDirection: "row", flexWrap: "wrap", gap: ESP.md },
    legendaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    legendaPonto: { width: 7, height: 7, borderRadius: 4 },
    legendaTexto: { ...TIPO.legenda, color: t.muted },
    legendaNumero: { color: t.text, fontWeight: "700", fontVariant: ["tabular-nums"] },
    erro: { ...TIPO.nota, color: t.crit, marginBottom: ESP.sm },

    cartao: { ...cartao(t.surface), padding: ESP.gutter, gap: ESP.sm },
    topo: { flexDirection: "row", alignItems: "center", gap: ESP.md },
    marca: { width: 10, height: 10, borderRadius: 5 },
    etapa: { ...TIPO.destaque, flex: 1, color: t.text, fontWeight: "600" },
    contagem: { ...TIPO.titulo2, fontVariant: ["tabular-nums"] },

    trilha: { height: 6, borderRadius: 3, backgroundColor: t.raise, overflow: "hidden" },
    preenchida: { height: 6, borderRadius: 3 },

    leads: { gap: 2, marginTop: ESP.xs },
    lead: { flexDirection: "row", alignItems: "center", gap: ESP.md, paddingVertical: 7, paddingHorizontal: ESP.sm, borderRadius: RAIO.peq, ...CURVA },
    avatar: { width: 30, height: 30, borderRadius: 15, ...CURVA, alignItems: "center", justifyContent: "center" },
    avatarTexto: { color: "#fff", fontWeight: "600", fontSize: 13 },
    leadNome: { ...TIPO.subtitulo, flex: 1, color: t.text },
    maisLeads: { ...TIPO.legenda, color: t.muted, paddingHorizontal: ESP.sm, paddingTop: 2 },
  });
