import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { TIPO } from "../../../src/ui/tipografia";
import { CURVA, ESP, ESPACO_BARRA, RAIO } from "../../../src/ui/forma";
import { SIMBOLO, Simbolo } from "../../../src/ui/simbolo";
import { useSession } from "../../../src/ui/session";
import { BotaoMais } from "../../../src/ui/botao-mais";
import { useTema } from "../../../src/ui/tema";
import { buildTheme } from "../../../src/ui/theme";
import { ApiError } from "../../../src/core/errors";
import { rotuloEspera, urgenciaDe } from "../../../src/core/espera";
import type { LeadFechamento } from "../../../src/core/contracts";

// ── Fila de fechamento ────────────────────────────────────────────────────────
// O oposto da caixa de entrada: aqui não há 1.271 conversas, há os poucos leads
// que JÁ aprovaram o orçamento e querem comprar. Ordenados do mais antigo para o
// mais novo, porque nesta fila o tempo é dinheiro perdido, não backlog.
//
// "Pegar" é ATÔMICO no servidor e silencia a IA: duas vendedoras tocando ao mesmo
// tempo, só uma leva — e a outra é avisada de quem levou, em vez de um erro seco.

export default function Fechamento() {
  const { client } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTema();
  const s = styles(theme);

  const [leads, setLeads] = useState<LeadFechamento[]>([]);
  const [semDono, setSemDono] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Um relógio só para a tela: recalcular "há quanto tempo" por cartão a cada
  // quadro seria desperdício, e por minuto é indistinguível a olho.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const carregar = useCallback(async () => {
    if (!client) return;
    try {
      const r = await client.fechamento();
      setLeads(r.leads);
      setSemDono(r.unclaimed);
      setErro(null);
    } catch (e) {
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar a fila de fechamento.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [client]);

  useEffect(() => { void carregar(); }, [carregar]);

  const pegar = useCallback(async (l: LeadFechamento) => {
    if (!client) return;
    setOcupado(l.contactId);
    try {
      const r = await client.pegarLead(l.contactId);
      if (r.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await carregar();
      } else {
        // Outra pessoa chegou antes. Dizer QUEM evita a vendedora insistir e
        // evita duas ligando para o mesmo cliente.
        Alert.alert("Este lead já foi pego", r.takenBy ? `${r.takenBy} está atendendo.` : "Outra pessoa está atendendo.");
        await carregar();
      }
    } catch (e) {
      Alert.alert("Não foi possível pegar o lead", e instanceof Error ? e.message : "Tente de novo.");
    } finally {
      setOcupado(null);
    }
  }, [client, carregar]);

  const moeda = (v: number | null, c: string) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: c || "BRL" });

  const resumoTopo =
    leads.length === 0 ? "Nada esperando"
    : semDono === 0 ? `${leads.length} em atendimento`
    : semDono === 1 ? "1 esperando alguém pegar"
    : `${semDono} esperando alguém pegar`;

  return (
    <>
      <Stack.Screen options={{ title: "Fechamento", headerLeft: () => <BotaoMais /> }} />

      <FlatList
        style={s.tela}
        data={leads}
        keyExtractor={(l) => l.contactId}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <>
            {erro ? <Text style={s.erro}>{erro}</Text> : null}
            <Text style={s.sub}>{resumoTopo}</Text>
          </>
        }
        contentContainerStyle={{
          padding: ESP.gutter, gap: ESP.md,
          paddingBottom: insets.bottom + ESPACO_BARRA,
          ...(leads.length === 0 ? { flexGrow: 1, alignItems: "center", justifyContent: "center" } : null),
        }}
        ListEmptyComponent={
          carregando
            ? <ActivityIndicator color={theme.accent} />
            : (
              <View style={s.vazioBox}>
                <Simbolo nome={"checkmark.seal.fill" as never} tamanho={34} cor={theme.good} />
                <Text style={s.vazioTitulo}>Fila limpa</Text>
                <Text style={s.vazio}>
                  Quando um lead aprovar o orçamento, ele aparece aqui para alguém assumir.
                </Text>
              </View>
            )
        }
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar(); }} tintColor={theme.accent} />
        }
        renderItem={({ item, index }) => {
          const desde = item.approvedAt ? Date.parse(item.approvedAt) : null;
          const urgencia = urgenciaDe(desde, agora);
          const corEspera = urgencia === "critica" ? theme.crit : urgencia === "atencao" ? theme.warn : theme.good;
          const livre = !item.ownerEmail;

          return (
            <Animated.View style={s.cartao} entering={FadeInDown.duration(240).delay(Math.min(index, 6) * 55)}>
              <View style={s.cartaoTopo}>
                <Text style={s.lead} numberOfLines={1}>{item.name}</Text>
                <Text style={s.total}>{moeda(item.total, item.currency)}</Text>
              </View>

              <View style={s.marcadores}>
                {desde ? (
                  <View style={[s.pilula, { backgroundColor: corEspera + "22" }]}>
                    <Simbolo nome={"clock.fill" as never} tamanho={10} cor={corEspera} />
                    <Text style={[s.pilulaTexto, { color: corEspera }]}>
                      aprovou há {rotuloEspera(desde, agora)}
                    </Text>
                  </View>
                ) : null}
                {item.quoteNumber ? <Text style={s.numero}>Orçamento {item.quoteNumber}</Text> : null}
              </View>

              {item.resumo ? <Text style={s.resumo} numberOfLines={2}>{item.resumo}</Text> : null}
              {item.city ? <Text style={s.resumo}>Entrega: {item.city}</Text> : null}
              {!livre ? (
                <Text style={s.dono}>
                  {item.mine ? "Você está atendendo" : `Com ${item.ownerName ?? item.ownerEmail}`}
                </Text>
              ) : null}

              <View style={s.acoes}>
                <Pressable
                  style={s.botaoNeutro}
                  onPress={() => router.push({
                    pathname: "/(app)/conversas/[contactId]",
                    params: { contactId: item.contactId, nome: item.name },
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir a conversa com ${item.name}`}
                >
                  <Text style={s.botaoNeutroTexto}>Abrir conversa</Text>
                </Pressable>
                {livre ? (
                  <Pressable
                    style={s.botaoPegar}
                    onPress={() => void pegar(item)}
                    disabled={ocupado === item.contactId}
                    accessibilityRole="button"
                    accessibilityLabel={`Pegar o lead ${item.name} para você`}
                  >
                    {ocupado === item.contactId
                      ? <ActivityIndicator color={theme.onAccent} />
                      : <Text style={s.botaoPegarTexto}>Pegar</Text>}
                  </Pressable>
                ) : null}
              </View>
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
    sub: { ...TIPO.nota, color: t.muted, marginBottom: ESP.sm },
    cartao: { backgroundColor: t.surface, borderRadius: 14, ...CURVA, borderWidth: 1, borderColor: t.border, padding: 14, gap: 6 },
    cartaoTopo: { flexDirection: "row", alignItems: "center", gap: 10 },
    lead: { ...TIPO.destaque, flex: 1, color: t.text },
    total: { ...TIPO.destaque, fontWeight: "700", color: t.accent, fontVariant: ["tabular-nums"] },
    marcadores: { flexDirection: "row", alignItems: "center", gap: ESP.sm, flexWrap: "wrap" },
    pilula: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RAIO.pilula, ...CURVA },
    pilulaTexto: { ...TIPO.legenda, fontWeight: "600" },
    numero: { ...TIPO.nota, color: t.muted },
    resumo: { ...TIPO.nota, color: t.muted },
    dono: { ...TIPO.nota, color: t.text, fontWeight: "600" },
    acoes: { flexDirection: "row", gap: 8, marginTop: 10 },
    botaoNeutro: { flex: 1, backgroundColor: t.raise, borderRadius: RAIO.peq, ...CURVA, paddingVertical: 12, alignItems: "center", justifyContent: "center", minHeight: 44 },
    botaoNeutroTexto: { ...TIPO.subtitulo, color: t.text, fontWeight: "500" },
    botaoPegar: { flex: 1, backgroundColor: t.accent, borderRadius: RAIO.peq, ...CURVA, paddingVertical: 12, alignItems: "center", justifyContent: "center", minHeight: 44 },
    botaoPegarTexto: { ...TIPO.subtitulo, color: t.onAccent, fontWeight: "600" },
    vazioBox: { alignItems: "center", justifyContent: "center", padding: 32, gap: ESP.sm },
    vazioTitulo: { ...TIPO.destaque, color: t.text },
    vazio: { ...TIPO.corpo, color: t.muted, textAlign: "center" },
    erro: { color: t.crit, ...TIPO.nota, paddingBottom: ESP.sm },
  });
