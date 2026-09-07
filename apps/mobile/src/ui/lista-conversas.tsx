// ── Caixa de entrada ──────────────────────────────────────────────────────────
// Composição de app iOS, não de página. O cabeçalho é o header NATIVO
// (react-native-screens): título grande que encolhe ao rolar, barra de busca do
// sistema com "Cancelar", fundo translúcido com o conteúdo passando por baixo.
//
// Antes eu desenhava tudo isso à mão — título fixo de 32px e uma caixa cinza de
// busca. Parecia site porque era: uma imitação estática de um comportamento que
// o sistema entrega pronto e animado.
//
// Os filtros rolam JUNTO com a lista (padrão da plataforma) e usam o segmented
// control nativo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS, ActivityIndicator, Alert, AppState, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useEscuro } from "./aparencia";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Haptics from "expo-haptics";
import { SIMBOLO, Simbolo } from "./simbolo";
import { BotaoMais } from "./botao-mais";
import { TIPO } from "./tipografia";
import { CURVA, ESP, ESPACO_BARRA, RAIO } from "./forma";
import { useSession } from "./session";
import { useBadges } from "./nav";
import { useTema } from "./tema";
import { accentAlpha, avatarColor, buildTheme, STAGE, VERDE_ESPERA } from "./theme";
import { ApiError } from "../core/errors";
import { aguardandoResposta, campanhaDe, campanhasContadas, campanhasDe, filtrarConversas, type Filtro } from "../core/inbox";
import { esperandoDesde, rotuloEspera, urgenciaDe } from "../core/espera";
import { guardarLista, lerLista } from "./cache";
import { guardarCampanhas } from "./campanhas-store";
import type { ConversationRow } from "../core/contracts";

export type { Filtro };

const PAGINA = 30;
const FILTROS: Filtro[] = ["todas", "aguardando", "minhas", "arquivadas"];
const ROTULOS = ["Todas", "Aguardando", "Minhas", "Arquivadas"];

const ROTULO_MIDIA: Record<string, string> = {
  image: "Foto", audio: "Áudio", video: "Vídeo",
  document: "Documento", sticker: "Figurinha", location: "Localização",
};

/** Anexa a página nova descartando o que já está na lista, por contactId. */
function juntarSemRepetir(antes: ConversationRow[], novas: ConversationRow[]): ConversationRow[] {
  const vistos = new Set(antes.map((c) => c.contactId));
  return [...antes, ...novas.filter((c) => !vistos.has(c.contactId))];
}

const previa = (c: ConversationRow) =>
  (c.lastText && c.lastText.trim()) || (c.lastType && ROTULO_MIDIA[c.lastType]) || "—";

function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const agora = new Date();
  if (d.toDateString() === agora.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function ListaConversas() {
  const { client, me } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTema();
  const s = styles(theme);

  const { campanha } = useLocalSearchParams<{ campanha?: string }>();

  // Primeira pintura SEM esperar a rede: a última lista conhecida aparece na
  // hora e é substituída quando o servidor responde. Antes era um spinner.
  const [linhas, setLinhas] = useState<ConversationRow[]>(() => lerLista());
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [campanhaSel, setCampanhaSel] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(() => lerLista().length === 0);
  const [atualizando, setAtualizando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [meuEmail, setMeuEmail] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Estado do React não serve de trava: `setCarregandoMais(true)` só vale no
  // próximo render, e até lá o onEndReached já disparou de novo.
  const buscandoMais = useRef(false);

  useEffect(() => { if (campanha) setCampanhaSel(campanha); }, [campanha]);

  const carregar = useCallback(async (opts: { offset?: number; silencioso?: boolean } = {}) => {
    if (!client) return;
    const offset = opts.offset ?? 0;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;

    if (!opts.silencioso && offset === 0) setCarregando(true);
    if (offset > 0) { buscandoMais.current = true; setCarregandoMais(true); }

    try {
      const r = await client.conversations({
        limit: PAGINA, offset, q: busca,
        onlyMine: filtro === "minhas",
        arquivadas: filtro === "arquivadas",
        signal: ctrl.signal,
      });
      setLinhas((antes) => (offset === 0 ? r.conversations : juntarSemRepetir(antes, r.conversations)));
      // Só a primeira página vira cache — é o que a próxima abertura precisa.
      if (offset === 0 && !busca && filtro === "todas") guardarLista(r.conversations);
      setTemMais(r.hasMore);
      setMeuEmail(r.me);
      setErro(null);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar as conversas.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
      setCarregandoMais(false);
      buscandoMais.current = false;
    }
  }, [client, busca, filtro]);

  useEffect(() => {
    const t = setTimeout(() => { void carregar(); }, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  useFocusEffect(useCallback(() => {
    void carregar({ silencioso: true });
  }, [carregar]));

  // A lista se atualiza sozinha enquanto está visível. Não há SSE de lista no
  // servidor, então é uma verificação a cada 20s — bem mais leve que o polling
  // de 6s do portal, e só com o app em primeiro plano.
  useFocusEffect(useCallback(() => {
    const tick = () => { if (AppState.currentState === "active") void carregar({ silencioso: true }); };
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [carregar]));

  // Contador no ÍCONE do app. Vem do SERVIDOR, não das linhas carregadas:
  // somar o que está na tela dava no máximo o tamanho da página — com 1.271
  // conversas e páginas de 30, o iPhone mostrava "8" havendo centenas.
  const badges = useBadges();
  useEffect(() => {
    void Notifications.setBadgeCountAsync(badges.waiting).catch(() => {});
  }, [badges.waiting]);

  const campanhas = useMemo(() => campanhasDe(linhas), [linhas]);

  // A folha de campanhas é outra rota e não tem a lista carregada — deixa aqui
  // o que já foi calculado, em vez de mandar dezenas de nomes pela URL.
  const contadas = useMemo(() => campanhasContadas(linhas), [linhas]);
  useEffect(() => { guardarCampanhas(contadas); }, [contadas]);

  useEffect(() => {
    if (campanhaSel && !campanhas.includes(campanhaSel)) setCampanhaSel(null);
  }, [campanhas, campanhaSel]);

  const visiveis = filtrarConversas(linhas, filtro, campanhaSel);

  // Um relógio só para a lista inteira, a cada minuto: recalcular "há quanto
  // tempo" por linha, a cada quadro, seria desperdício.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const trocarFiltro = useCallback((i: number) => {
    void Haptics.selectionAsync().catch(() => {});
    setFiltro(FILTROS[i] ?? "todas");
    setCampanhaSel(null);
  }, []);

  const selecionarCampanha = useCallback((c: string | null) => {
    void Haptics.selectionAsync().catch(() => {});
    setCampanhaSel(c);
  }, []);

  // Estado COMPARTILHADO: some para a equipe inteira, não só neste aparelho.
  // Otimista, porque esperar a rede para riscar uma linha é atrito puro.
  const alternarLeitura = useCallback(async (c: ConversationRow, lida: boolean) => {
    void Haptics.selectionAsync().catch(() => {});
    setLinhas((f) => f.map((x) => (x.contactId === c.contactId ? { ...x, lida } : x)));
    try { await client?.marcarEstado(c.contactId, { lida }); }
    catch { setLinhas((f) => f.map((x) => (x.contactId === c.contactId ? { ...x, lida: !lida } : x))); }
  }, [client]);

  /** Tira da caixa sem apagar nada — some para todo mundo. */
  const arquivar = useCallback(async (c: ConversationRow) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLinhas((f) => f.filter((x) => x.contactId !== c.contactId));
    try { await client?.marcarEstado(c.contactId, { arquivada: true }); }
    catch { void carregar({ silencioso: true }); }
  }, [client, carregar]);

  /**
   * Assumir em LOTE. A JR abriu o app com ~1.250 conversas sem dona: pegar uma
   * a uma não é trabalho, é desistência. Pega as livres que estão na tela agora
   * — o filtro é a seleção, e por isso o aviso diz o número exato antes.
   */
  const TETO_LOTE = 100;
  const assumirLote = useCallback(async (livres: ConversationRow[]) => {
    if (!client || !meuEmail || livres.length === 0) return;
    const alvo = livres.slice(0, TETO_LOTE);
    try {
      const r = await client.assumirVarias(alvo.map((c) => c.contactId));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Ignoradas = alguém assumiu primeiro. Dizer isso evita a vendedora achar
      // que pegou conversa que na verdade é de outra.
      Alert.alert(
        r.assumidas === 1 ? "1 conversa assumida" : `${r.assumidas} conversas assumidas`,
        r.ignoradas > 0 ? `${r.ignoradas} já tinham outra responsável.` : undefined,
      );
      await carregar({ silencioso: true });
    } catch (e) {
      Alert.alert("Não foi possível assumir", e instanceof Error ? e.message : "Tente de novo.");
    }
  }, [client, meuEmail, carregar]);

  /** Pressionar e segurar: as mesmas ações do deslizar, para quem prefere o menu. */
  const menuDaLinha = useCallback((c: ConversationRow, naTela: ConversationRow[]) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const nova = !c.lida;
    const souDona = !!c.assignedEmail && c.assignedEmail === meuEmail;
    const livres = naTela.filter((x) => !x.assignedEmail).slice(0, TETO_LOTE);
    const opcoes = [nova ? "Marcar como lida" : "Marcar como não lida"];
    if (!souDona) opcoes.push("Assumir conversa");
    const iLote = livres.length > 1 ? opcoes.length : -1;
    if (iLote >= 0) opcoes.push(`Assumir as ${livres.length} livres desta lista`);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: c.name,
        options: [...opcoes, "Cancelar"],
        cancelButtonIndex: opcoes.length,
        userInterfaceStyle: theme.dark ? "dark" : "light",
      },
      async (i) => {
        if (i === 0) { alternarLeitura(c, nova); return; }
        if (i === iLote) {
          // Lote mexe em muita coisa de uma vez: confirma antes, sempre.
          Alert.alert(
            `Assumir ${livres.length} conversas?`,
            "Você passa a ser a responsável por todas elas.",
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Assumir", onPress: () => void assumirLote(livres) },
            ],
          );
          return;
        }
        if (i === 1 && client && meuEmail) {
          try {
            await client.assign(c.contactId, meuEmail);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            await carregar({ silencioso: true });
          } catch { /* silencioso: o menu já fechou */ }
        }
      },
    );
  }, [meuEmail, theme.dark, alternarLeitura, client, carregar, assumirLote]);

  const vazio =
    busca ? "Nenhuma conversa encontrada."
    : campanhaSel ? "Nenhum lead desta campanha."
    : filtro === "aguardando" ? "Nenhum lead esperando resposta."
    : filtro === "minhas" ? "Você ainda não é dona de nenhuma conversa."
    : "Nenhuma conversa ainda.";

  const renderItem = ({ item, index: indice }: { item: ConversationRow; index: number }) => {
    const nova = !item.lida;
    // Há quanto tempo o lead espera. Com 1.257 aguardando, é isto que separa
    // "tenho mil conversas" de "estas cinco estão me custando venda".
    const desde = esperandoDesde(item.lastInboundAt, item.lastOutboundAt);
    const urgencia = urgenciaDe(desde, agora);
    const corEspera = urgencia === "critica" ? theme.crit
      : urgencia === "atencao" ? theme.warn
      : theme.muted;
    const etapa = item.funnelStage ? STAGE[item.funnelStage] : null;
    // UM marcador, não quatro. Três rótulos coloridos empilhados sob cada linha
    // é pensamento de tabela de dados — nenhum app de mensagem faz isso, e era o
    // que mais dava cara de painel web à caixa de entrada.
    //
    // A etapa fica (é o sinal de negócio que a vendedora lê de relance). Campanha
    // e dono saem da lista: a campanha já aparece no topo da conversa, e o dono é
    // exatamente o que o filtro "Minhas" resolve.

    const souDona = !!item.assignedEmail && item.assignedEmail === meuEmail;

    // Deslizar revela as ações — o gesto que todo app de caixa de entrada tem.
    const acoes = () => (
      <View style={s.acoes}>
        <Pressable
          style={[s.acao, { backgroundColor: "#2563EB" }]}
          onPress={() => alternarLeitura(item, nova)}
          accessibilityRole="button"
        >
          <Simbolo nome={(nova ? "envelope.open.fill" : "envelope.badge.fill") as never} tamanho={20} cor="#fff" />
          <Text style={s.acaoTexto}>{nova ? "Lida" : "Não lida"}</Text>
        </Pressable>
        <Pressable
          style={[s.acao, { backgroundColor: theme.muted }]}
          onPress={() => void arquivar(item)}
          accessibilityRole="button"
          accessibilityLabel={`Arquivar conversa com ${item.name}`}
        >
          <Simbolo nome={"archivebox.fill" as never} tamanho={20} cor="#fff" />
          <Text style={s.acaoTexto}>Arquivar</Text>
        </Pressable>
        {!souDona ? (
          <Pressable
            style={[s.acao, { backgroundColor: theme.accent }]}
            onPress={async () => {
              if (!client || !meuEmail) return;
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              try { await client.assign(item.contactId, meuEmail); await carregar({ silencioso: true }); } catch { /* silencioso */ }
            }}
            accessibilityRole="button"
          >
            <Simbolo nome={"person.fill.checkmark" as never} tamanho={20} cor={theme.onAccent} />
            <Text style={[s.acaoTexto, { color: theme.onAccent }]}>Assumir</Text>
          </Pressable>
        ) : null}
      </View>
    );

    // Só a primeira tela anima. O resto entra direto.
    const Envolucro = indice < 10 ? Animated.View : View;
    const animacao = indice < 10
      ? { entering: FadeInDown.duration(230).delay(indice * 26) }
      : {};

    return (
      <Envolucro {...animacao}>
      <Swipeable renderRightActions={acoes} friction={1.6} rightThreshold={38} overshootRight={false}>
      <Pressable
        onPress={() => router.push({
          pathname: "/(app)/conversas/[contactId]",
          // O nome viaja junto para o cabeçalho da conversa não abrir vazio.
          params: { contactId: item.contactId, nome: item.name },
        })}
        onLongPress={() => menuDaLinha(item, visiveis)}
        delayLongPress={340}
        accessibilityRole="button"
        accessibilityLabel={`Conversa com ${item.name}`}
        style={({ pressed }) => [s.linha, pressed && { backgroundColor: theme.raise }]}
      >
        <View style={[s.avatar, { backgroundColor: avatarColor(item.name) }]}>
          <Text style={s.avatarTexto}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
        </View>

        <View style={s.corpo}>
          <View style={s.topo}>
            <Text style={[s.nome, nova && s.nomeNaoLida]} numberOfLines={1}>{item.name}</Text>
            {urgencia === "nenhuma" ? (
              <Text style={s.hora} maxFontSizeMultiplier={1.3}>{horaCurta(item.lastMessageAt)}</Text>
            ) : (
              <View style={[s.espera, { backgroundColor: `${corEspera}1A` }]}>
                <Text style={[s.esperaTexto, { color: corEspera }]} maxFontSizeMultiplier={1.2}>
                  {rotuloEspera(desde, agora)}
                </Text>
              </View>
            )}
          </View>

          <View style={s.meio}>
            <Text style={[s.previa, nova && s.previaNaoLida]} numberOfLines={1}>
              {item.lastDirection === "out" ? "✓ " : ""}{previa(item)}
            </Text>
            {/* O ponto agora diz NÃO LIDA — que é o que marcar/desmarcar muda,
                e o que a pessoa procura de relance. "Aguardando resposta" já tem
                a própria aba, e ter dois pontos verdes com sentidos diferentes
                na mesma linha era o que confundia. */}
            {nova ? <View style={s.pontoNaoLida} accessibilityLabel="Não lida" /> : null}
          </View>

          {/* Etapa + etiquetas + origem numa linha só. As etiquetas voltaram
              porque são o que a vendedora escreveu sobre o lead — informação
              dela, não do sistema. O que eu tinha cortado antes eram os rótulos
              REDUNDANTES (campanha e dono, que já aparecem em outros lugares). */}
          {etapa || item.tags.length > 0 || item.fromAd ? (
            <View style={s.marcadores}>
              {item.fromAd ? (
                <View style={[s.selo, { backgroundColor: accentAlpha(theme.accent, 0.12) }]}>
                  <Text style={[s.seloTexto, { color: theme.accent }]} maxFontSizeMultiplier={1.2}>ADS</Text>
                </View>
              ) : null}
              {etapa ? (
                <Text style={[s.marcador, { color: etapa.color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {etapa.label}
                </Text>
              ) : null}
              {item.tags.slice(0, 2).map((t) => (
                <View key={t.id} style={[s.etiqueta, { backgroundColor: t.color }]}>
                  <Text style={s.etiquetaTexto} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t.name}</Text>
                </View>
              ))}
              {item.tags.length > 2 ? (
                <Text style={s.maisEtiquetas} maxFontSizeMultiplier={1.2}>+{item.tags.length - 2}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      </Swipeable>
      </Envolucro>
    );
  };

  // Busca e filtros rolam com a lista — padrão iOS. Não são cabeçalho fixo.
  const cabecalhoDaLista = (
    <View style={s.filtros}>
      <View style={s.busca}>
        <Simbolo nome={SIMBOLO.busca as never} tamanho={16} cor={theme.muted} />
        <TextInput
          style={s.buscaCampo}
          value={busca}
          onChangeText={setBusca}
          placeholder="Pesquisar"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Pesquisar conversas"
        />
      </View>

      <SegmentedControl
        values={ROTULOS}
        selectedIndex={FILTROS.indexOf(filtro)}
        onChange={(e) => trocarFiltro(e.nativeEvent.selectedSegmentIndex)}
        appearance={theme.dark ? "dark" : "light"}
      />

      {campanhas.length > 0 ? (
        <Pressable
          onPress={() => router.push({ pathname: "/campanhas", params: { atual: campanhaSel ?? "" } })}
          accessibilityRole="button"
          accessibilityLabel="Filtrar por campanha"
          style={({ pressed }) => [s.seletor, campanhaSel != null && s.seletorAtivo, pressed && { opacity: 0.6 }]}
        >
          <Simbolo
            nome={SIMBOLO.anuncios as never}
            tamanho={15}
            cor={campanhaSel != null ? theme.accent : theme.muted}
          />
          <Text
            style={[s.seletorTexto, campanhaSel != null && { color: theme.accent, fontWeight: "700" }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {campanhaSel ?? "Todas as campanhas"}
          </Text>
          {campanhaSel != null ? (
            <Pressable onPress={() => selecionarCampanha(null)} hitSlop={12} accessibilityLabel="Limpar filtro de campanha">
              <Simbolo nome={SIMBOLO.fechar as never} tamanho={13} cor={theme.accent} />
            </Pressable>
          ) : (
            <Simbolo nome={"chevron.down" as never} tamanho={12} cor={theme.muted} />
          )}
        </Pressable>
      ) : null}

      {erro ? (
        <View style={s.erroCaixa}>
          <Text style={s.erroTexto}>{erro}</Text>
          <Pressable onPress={() => void carregar()}><Text style={s.tentar}>Tentar de novo</Text></Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Conversas",
          headerLeft: () => <BotaoMais />,
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/perfil")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Perfil e conta"
            >
              <Simbolo nome={SIMBOLO.pessoa as never} tamanho={26} cor={theme.accent} />
            </Pressable>
          ),
          // Busca do SISTEMA: aparece sob o título grande, com "Cancelar" e
          // teclado próprio — não é uma caixa de texto imitando uma.

        }}
      />

      {/* A lista NUNCA é substituída por um spinner de tela cheia. Trocar de
          filtro disparava `carregando` e o ecrã inteiro virava branco — sumindo
          com o segmented control, que é justamente o controle que o usuário
          acabou de tocar. O carregamento agora acontece DENTRO da lista. */}
      <FlatList
          style={s.tela}
          data={visiveis}
          keyExtractor={(c) => c.contactId}
          renderItem={renderItem}
          ListHeaderComponent={cabecalhoDaLista}
          ItemSeparatorComponent={() => <View style={s.separador} />}
          // Faz o título grande encolher e a busca se comportar como no sistema.
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingBottom: insets.bottom + ESPACO_BARRA,
            ...(visiveis.length === 0 ? { flexGrow: 1 } : null),
          }}
          ListEmptyComponent={
            carregando ? (
              <View style={s.vazioBox}><ActivityIndicator color={theme.accent} /></View>
            ) : (
              <View style={s.vazioBox}>
                <Simbolo
                  nome={(filtro === "aguardando" ? SIMBOLO.relogio : SIMBOLO.caixaVazia) as never}
                  tamanho={48}
                  cor={theme.border}
                />
                <Text style={s.vazio}>{vazio}</Text>
              </View>
            )
          }
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => { setAtualizando(true); void carregar({ silencioso: true }); }}
              tintColor={theme.accent}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (temMais && !buscandoMais.current) void carregar({ offset: linhas.length });
          }}
          ListFooterComponent={carregandoMais ? <ActivityIndicator style={s.rodape} color={theme.accent} /> : null}
        />
    </>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.surface },

    filtros: { paddingHorizontal: ESP.gutter, paddingTop: ESP.sm, paddingBottom: ESP.md, gap: ESP.md, backgroundColor: t.surface },
    // Campo de busca no vocabulário do iOS: fundo cinza, cantos de pílula.
    busca: {
      flexDirection: "row", alignItems: "center", gap: ESP.sm,
      backgroundColor: t.raise, borderRadius: RAIO.peq, ...CURVA,
      paddingHorizontal: ESP.md, height: 36,
    },
    buscaCampo: { ...TIPO.corpo, flex: 1, color: t.text, padding: 0 },
    // Um seletor só, largura cheia: diz a campanha ATUAL e abre a lista inteira.
    // As pílulas horizontais escondiam as últimas campanhas fora da tela.
    seletor: {
      flexDirection: "row", alignItems: "center", gap: ESP.sm,
      borderRadius: RAIO.peq, ...CURVA, backgroundColor: t.raise,
      paddingHorizontal: ESP.md, paddingVertical: 9,
    },
    seletorAtivo: { backgroundColor: accentAlpha(t.accent, 0.1) },
    seletorTexto: { ...TIPO.subtitulo, flex: 1, color: t.muted, fontWeight: "600" },

    linha: { flexDirection: "row", alignItems: "center", gap: ESP.md, paddingVertical: 10, paddingHorizontal: ESP.gutter, backgroundColor: t.surface },
    avatar: { width: 52, height: 52, borderRadius: 26, ...CURVA, alignItems: "center", justifyContent: "center" },
    // A linha cresce por PADDING, não por altura fixa: com fonte grande ela
    // acompanha em vez de cortar o texto.
    avatarTexto: { color: "#fff", fontWeight: "500", fontSize: 22 },
    corpo: { flex: 1, gap: 2 },
    topo: { flexDirection: "row", alignItems: "baseline", gap: 8 },
    nome: { ...TIPO.destaque, flex: 1, color: t.text },
    // Peso = "você ainda não abriu". Cor do ponto = "o lead está esperando".
    // Dois sinais distintos, um de cada tipo — em vez de dois pontos brigando.
    nomeNaoLida: { fontWeight: "800" },
    previaNaoLida: { color: t.text, fontWeight: "500" },
    hora: { ...TIPO.nota, color: t.waMuted },
    // Pílula em vez de texto solto: o tempo de espera precisa competir com o
    // nome pela atenção, não desaparecer no canto.
    espera: { borderRadius: RAIO.pilula, paddingHorizontal: 7, paddingVertical: 2 },
    esperaTexto: { ...TIPO.legenda, fontWeight: "700", fontVariant: ["tabular-nums"] },
    meio: { flexDirection: "row", alignItems: "center", gap: 8 },
    previa: { ...TIPO.subtitulo, flex: 1, color: t.waMuted },
    pontoNaoLida: { width: 10, height: 10, borderRadius: 5, backgroundColor: VERDE_ESPERA },
    marcador: { ...TIPO.nota, fontWeight: "600", marginTop: 1 },

    separador: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 80 },
    acoes: { flexDirection: "row" },
    acao: { width: 78, alignItems: "center", justifyContent: "center", gap: 3 },
    acaoTexto: { ...TIPO.legenda2, color: "#fff", fontWeight: "600" },
    centro: { flex: 1, alignItems: "center", justifyContent: "center" },
    vazioBox: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    vazio: { ...TIPO.corpo, color: t.muted, textAlign: "center", marginTop: 14 },
    marcadores: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1, flexWrap: "nowrap", overflow: "hidden" },
    selo: { borderRadius: RAIO.pilula, paddingHorizontal: 6, paddingVertical: 1 },
    seloTexto: { ...TIPO.legenda2, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3 },
    etiqueta: { borderRadius: RAIO.pilula, ...CURVA, paddingHorizontal: 7, paddingVertical: 1.5, maxWidth: 96 },
    etiquetaTexto: { ...TIPO.legenda2, fontSize: 9.5, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
    maisEtiquetas: { ...TIPO.legenda2, fontSize: 10, color: t.muted, fontWeight: "700" },
    rodape: { paddingVertical: 16 },
    erroCaixa: { padding: ESP.md, backgroundColor: t.critSoft, borderRadius: RAIO.peq, ...CURVA, gap: ESP.xs },
    erroTexto: { ...TIPO.nota, color: t.crit },
    tentar: { ...TIPO.nota, color: t.accent, fontWeight: "600" },
  });
