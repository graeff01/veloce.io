import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, View,
} from "react-native";
import { useEscuro } from "../../../src/ui/aparencia";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { TIPO } from "../../../src/ui/tipografia";
import { CURVA, ESP, ESPACO_BARRA, RAIO, cartao } from "../../../src/ui/forma";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSession } from "../../../src/ui/session";
import { BotaoMais } from "../../../src/ui/botao-mais";
import { useTema } from "../../../src/ui/tema";
import { buildTheme } from "../../../src/ui/theme";
import { ApiError } from "../../../src/core/errors";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { Simbolo } from "../../../src/ui/simbolo";
import { rotuloEspera, urgenciaDe } from "../../../src/core/espera";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import type { LeadFechamento, OrcamentoEnviado, QuoteReview } from "../../../src/core/contracts";

/**
 * As três faces do orçamento, na sequência do negócio: o que espera meu aval, o
 * que já saiu e aguarda o lead, e quem aprovou e quer fechar.
 *
 * Fechamento mora AQUI, e não numa aba própria, porque a barra inferior é para o
 * que se usa o dia inteiro — e porque as três coisas são o mesmo assunto.
 */
type Aba = "revisar" | "enviados" | "fechamento";

// ── Revisão de orçamento ──────────────────────────────────────────────────────
// O PDF continua sendo gerado no SERVIDOR (lib/quote-pdf.ts, mesmo layout que a
// IA usa). O app baixa os bytes com a credencial e mostra numa FOLHA (app/pdf) —
// nada de reimplementar geração de PDF no aparelho.

export default function Revisao() {
  const { client, me } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTema();
  const s = styles(theme);

  const [itens, setItens] = useState<QuoteReview[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A notificação de fechamento abre esta tela já no segmento certo.
  const { aba: abaInicial } = useLocalSearchParams<{ aba?: string }>();
  const [aba, setAba] = useState<Aba>(abaInicial === "fechamento" ? "fechamento" : "revisar");
  const [enviados, setEnviados] = useState<OrcamentoEnviado[]>([]);
  const [fechamento, setFechamento] = useState<LeadFechamento[]>([]);
  const [semDono, setSemDono] = useState(0);
  const [pegando, setPegando] = useState<string | null>(null);
  // As seções do /me mandam, como em todo o resto do app.
  const secoes = me?.sections ?? [];
  const podeRevisar = secoes.includes("revisao") && me?.quotesEnabled === true;
  const podeFechar = secoes.includes("fechamento");

  // As seções chegam com o /me, que é assíncrono: um cliente que só tem
  // fechamento abriria numa aba inexistente. Aqui a escolha é corrigida assim
  // que se sabe o que ele pode ver.
  useEffect(() => {
    if (aba === "fechamento" && !podeFechar) setAba("revisar");
    if (aba !== "fechamento" && !podeRevisar && podeFechar) setAba("fechamento");
  }, [aba, podeRevisar, podeFechar]);

  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // Cada lista secundária só é buscada quando a pessoa abre o segmento: são até
  // 500 linhas de enviados, e elas não fazem falta enquanto ela decide o que
  // aprovar.
  const carregarFechamento = useCallback(async () => {
    if (!client) return;
    const r = await client.fechamento();
    setFechamento(r.leads);
    setSemDono(r.unclaimed);
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let vivo = true;
    if (aba === "enviados") {
      void client.orcamentosEnviados()
        .then((r) => { if (vivo) setEnviados(r); })
        .catch(() => { /* a faixa de erro da tela já cobre a lista principal */ });
    } else if (aba === "fechamento") {
      void carregarFechamento().catch(() => {});
    }
    return () => { vivo = false; };
  }, [aba, client, carregarFechamento]);

  /** "Pegar" é atômico no servidor: duas vendedoras tocando junto, só uma leva. */
  const pegar = useCallback(async (l: LeadFechamento) => {
    if (!client) return;
    setPegando(l.contactId);
    try {
      const r = await client.pegarLead(l.contactId);
      if (r.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Dizer QUEM pegou evita duas pessoas ligarem para o mesmo cliente.
      else Alert.alert("Este lead já foi pego", r.takenBy ? `${r.takenBy} está atendendo.` : "Outra pessoa está atendendo.");
      await carregarFechamento();
    } catch (e) {
      Alert.alert("Não foi possível pegar o lead", e instanceof Error ? e.message : "Tente de novo.");
    } finally {
      setPegando(null);
    }
  }, [client, carregarFechamento]);

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

  const moeda = (v: number | null, c: string) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: c || "BRL" });

  // Cada segmento só aparece para quem tem a seção. Um cliente pode ter
  // fechamento sem revisão, e vice-versa.
  const ABAS = ([
    { chave: "revisar", rotulo: "A revisar", visivel: podeRevisar },
    { chave: "enviados", rotulo: "Enviados", visivel: podeRevisar },
    { chave: "fechamento", rotulo: "Fechamento", visivel: podeFechar },
  ] as const).filter((a) => a.visivel);

  const dados: (QuoteReview | OrcamentoEnviado | LeadFechamento)[] =
    aba === "revisar" ? itens : aba === "enviados" ? enviados : fechamento;

  const resumo =
    aba === "revisar" ? (itens.length === 0 ? "Nada pendente" : `${itens.length} aguardando você`)
    : aba === "enviados" ? (() => {
        const esperando = enviados.filter((q) => q.status === "sent").length;
        return esperando === 0 ? "Nenhum sem resposta"
          : esperando === 1 ? "1 sem resposta do lead"
          : `${esperando} sem resposta do lead`;
      })()
    : fechamento.length === 0 ? "Nada esperando"
      : semDono === 0 ? `${fechamento.length} em atendimento`
      : semDono === 1 ? "1 esperando alguém pegar"
      : `${semDono} esperando alguém pegar`;

  const vazio =
    aba === "revisar" ? "Nenhum orçamento aguardando revisão."
    : aba === "enviados" ? "Nenhum orçamento enviado ainda."
    : "Fila limpa. Quando um lead aprovar o orçamento, ele aparece aqui.";

  return (
    <>
      <Stack.Screen options={{ title: "Orçamentos", headerLeft: () => <BotaoMais /> }} />

      <FlatList<QuoteReview | OrcamentoEnviado | LeadFechamento>
        style={s.tela}
        data={dados}
        keyExtractor={(q) => ("quoteId" in q ? q.quoteId : "approvedAt" in q ? q.contactId : q.id)}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <>
            {erro ? <Text style={s.erro}>{erro}</Text> : null}
            <SegmentedControl
              values={ABAS.map((a) => a.rotulo)}
              selectedIndex={Math.max(0, ABAS.findIndex((a) => a.chave === aba))}
              onChange={(e) => {
                void Haptics.selectionAsync().catch(() => {});
                setAba(ABAS[e.nativeEvent.selectedSegmentIndex]?.chave ?? "revisar");
              }}
              appearance={theme.dark ? "dark" : "light"}
            />
            <Text style={s.sub}>{resumo}</Text>
          </>
        }
        contentContainerStyle={{
          padding: ESP.gutter, gap: ESP.md,
          paddingBottom: insets.bottom + ESPACO_BARRA,
        }}
        // O vazio é uma CAIXA com altura própria, não um contentContainer
        // centralizado: centralizar o container puxava o segmented control para
        // o meio da tela junto com o texto, e ele deixava de parecer tocável.
        ListEmptyComponent={
          <View style={s.vazioBox}>
            {carregando
              ? <ActivityIndicator color={theme.accent} />
              : <Text style={s.vazio}>{vazio}</Text>}
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar(); }} tintColor={theme.accent} />
        }
        renderItem={({ item, index }) => {
          // Discriminante da união, sem campo extra inventado: "quoteId" só
          // existe em revisão, "approvedAt" só em fechamento, "id" no enviado.
          if ("approvedAt" in item) {
            return (
              <CartaoFechamento
                l={item} indice={index} agora={agora} theme={theme}
                ocupado={pegando === item.contactId} aoPegar={() => void pegar(item)}
              />
            );
          }
          if (!("quoteId" in item)) return <CartaoEnviado q={item} indice={index} agora={agora} theme={theme} />;
          return (
          <Animated.View style={s.cartao} entering={FadeInDown.duration(240).delay(Math.min(index, 6) * 55)}>
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
              <Pressable
                style={s.botaoNeutro}
                onPress={() => router.push({ pathname: "/pdf", params: { quoteId: item.quoteId, titulo: String(item.number) } })}
                accessibilityRole="button"
                accessibilityLabel={`Ver o PDF do orçamento de ${item.name}`}
              >
                <Text style={s.botaoNeutroTexto}>Ver PDF</Text>
              </Pressable>
              <Pressable style={s.botaoRejeitar} onPress={() => decidir(item, false)} disabled={ocupado === item.quoteId}
                accessibilityRole="button" accessibilityLabel={`Rejeitar o orçamento de ${item.name}`}>
                <Text style={s.botaoRejeitarTexto}>Rejeitar</Text>
              </Pressable>
              <Pressable style={s.botaoAprovar} onPress={() => decidir(item, true)} disabled={ocupado === item.quoteId}
                accessibilityRole="button" accessibilityLabel={`Aprovar e enviar o orçamento de ${item.name}`}>
                {ocupado === item.quoteId
                  ? <ActivityIndicator color={theme.onAccent} />
                  : <Text style={s.botaoAprovarTexto}>Aprovar</Text>}
              </Pressable>
            </View>
          </Animated.View>
          );
        }}
      />
    </>
  );
}

/**
 * Orçamento que JÁ saiu para o lead. O que interessa aqui não é decidir nada —
 * é ver há quanto tempo está sem resposta e ir atrás.
 */
function CartaoEnviado({ q, indice, agora, theme }: {
  q: OrcamentoEnviado; indice: number; agora: number; theme: ReturnType<typeof buildTheme>;
}) {
  const s = styles(theme);
  const router = useRouter();
  const desde = q.sentAt ? Date.parse(q.sentAt) : null;
  const esperando = q.status === "sent";
  const urgencia = urgenciaDe(desde, agora);
  const cor = !esperando ? theme.muted : urgencia === "critica" ? theme.crit : urgencia === "atencao" ? theme.warn : theme.good;
  const rotulo = q.status === "approved" ? "aprovado" : q.status === "rejected" ? "recusado" : "sem resposta";
  const moeda = (v: number | null, c: string) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: c || "BRL" });

  return (
    <Animated.View entering={FadeInDown.duration(240).delay(Math.min(indice, 6) * 55)}>
      <Pressable
        style={({ pressed }) => [s.cartao, pressed && { opacity: 0.7 }]}
        onPress={() => router.push({
          pathname: "/(app)/conversas/[contactId]",
          params: { contactId: q.contactId, nome: q.contactName ?? "" },
        })}
        accessibilityRole="button"
        accessibilityLabel={`Abrir a conversa com ${q.contactName ?? "o lead"}, orçamento ${rotulo}`}
      >
        <View style={s.cartaoTopo}>
          <Text style={s.lead} numberOfLines={1}>{q.contactName ?? "Lead"}</Text>
          <Text style={s.total}>{moeda(q.total, q.currency)}</Text>
        </View>
        <View style={s.marcadores}>
          <View style={[s.pilula, { backgroundColor: cor + "22" }]}>
            <Simbolo nome={(esperando ? "clock.fill" : q.status === "approved" ? "checkmark.circle.fill" : "xmark.circle.fill") as never} tamanho={10} cor={cor} />
            <Text style={[s.pilulaTexto, { color: cor }]}>
              {esperando && desde ? `${rotulo} há ${rotuloEspera(desde, agora)}` : rotulo}
            </Text>
          </View>
          {q.number ? <Text style={s.numero}>Orçamento {q.number}</Text> : null}
        </View>
        {q.summary ? <Text style={s.resumo} numberOfLines={2}>{q.summary}</Text> : null}
      </Pressable>
    </Animated.View>
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
    marcadores: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 },
    pilula: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RAIO.pilula, ...CURVA },
    pilulaTexto: { ...TIPO.legenda, fontWeight: "600" },
    resumo: { ...TIPO.nota, color: t.muted },
    linhaItem: { flexDirection: "row", gap: 8, marginTop: 2 },
    linhaLabel: { ...TIPO.subtitulo, flex: 1, color: t.text },
    linhaValor: { ...TIPO.subtitulo, color: t.muted, fontVariant: ["tabular-nums"] },
    acoes: { flexDirection: "row", gap: 8, marginTop: 10 },
    botaoNeutro: { flex: 1, backgroundColor: t.raise, borderRadius: RAIO.peq, ...CURVA, paddingVertical: 12, alignItems: "center" },
    botaoNeutroTexto: { ...TIPO.subtitulo, color: t.text, fontWeight: "500" },
    botaoRejeitar: { flex: 1, backgroundColor: t.critSoft, borderRadius: RAIO.peq, ...CURVA, paddingVertical: 12, alignItems: "center" },
    botaoRejeitarTexto: { ...TIPO.subtitulo, color: t.crit, fontWeight: "500" },
    botaoAprovar: { flex: 1.2, backgroundColor: t.accent, borderRadius: RAIO.peq, ...CURVA, paddingVertical: 12, alignItems: "center", justifyContent: "center", minHeight: 44 },
    botaoAprovarTexto: { ...TIPO.subtitulo, color: t.onAccent, fontWeight: "600" },
    vazio: { ...TIPO.corpo, color: t.muted, textAlign: "center" },
    // Altura própria: é o que mantém o segmented control colado no topo quando
    // a lista está vazia, em vez de a tela inteira centralizar.
    vazioBox: { minHeight: 220, alignItems: "center", justifyContent: "center", paddingHorizontal: ESP.xl },
    dono: { ...TIPO.nota, color: t.text, fontWeight: "600" },
    erro: { color: t.crit, fontSize: 13, padding: 16 },
  });

/**
 * Lead que JÁ aprovou o orçamento e quer comprar. É a ponta mais quente do
 * funil: aqui o tempo é venda perdida, não backlog — por isso a espera é o
 * primeiro marcador do cartão.
 */
function CartaoFechamento({ l, indice, agora, theme, ocupado, aoPegar }: {
  l: LeadFechamento; indice: number; agora: number;
  theme: ReturnType<typeof buildTheme>; ocupado: boolean; aoPegar: () => void;
}) {
  const s = styles(theme);
  const router = useRouter();
  const desde = l.approvedAt ? Date.parse(l.approvedAt) : null;
  const urgencia = urgenciaDe(desde, agora);
  const cor = urgencia === "critica" ? theme.crit : urgencia === "atencao" ? theme.warn : theme.good;
  const livre = !l.ownerEmail;
  const moeda = (v: number | null, c: string) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: c || "BRL" });

  return (
    <Animated.View style={s.cartao} entering={FadeInDown.duration(240).delay(Math.min(indice, 6) * 55)}>
      <View style={s.cartaoTopo}>
        <Text style={s.lead} numberOfLines={1}>{l.name}</Text>
        <Text style={s.total}>{moeda(l.total, l.currency)}</Text>
      </View>

      <View style={s.marcadores}>
        {desde ? (
          <View style={[s.pilula, { backgroundColor: cor + "22" }]}>
            <Simbolo nome={"clock.fill" as never} tamanho={10} cor={cor} />
            <Text style={[s.pilulaTexto, { color: cor }]}>aprovou há {rotuloEspera(desde, agora)}</Text>
          </View>
        ) : null}
        {l.quoteNumber ? <Text style={s.numero}>Orçamento {l.quoteNumber}</Text> : null}
      </View>

      {l.resumo ? <Text style={s.resumo} numberOfLines={2}>{l.resumo}</Text> : null}
      {l.city ? <Text style={s.resumo}>Entrega: {l.city}</Text> : null}
      {!livre ? (
        <Text style={s.dono}>{l.mine ? "Você está atendendo" : `Com ${l.ownerName ?? l.ownerEmail}`}</Text>
      ) : null}

      <View style={s.acoes}>
        <Pressable
          style={s.botaoNeutro}
          onPress={() => router.push({
            pathname: "/(app)/conversas/[contactId]",
            params: { contactId: l.contactId, nome: l.name },
          })}
          accessibilityRole="button"
          accessibilityLabel={`Abrir a conversa com ${l.name}`}
        >
          <Text style={s.botaoNeutroTexto}>Abrir conversa</Text>
        </Pressable>
        {livre ? (
          <Pressable
            style={s.botaoAprovar}
            onPress={aoPegar}
            disabled={ocupado}
            accessibilityRole="button"
            accessibilityLabel={`Pegar o lead ${l.name} para você`}
          >
            {ocupado
              ? <ActivityIndicator color={theme.onAccent} />
              : <Text style={s.botaoAprovarTexto}>Pegar</Text>}
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
