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
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Haptics from "expo-haptics";
import { User } from "lucide-react-native";
import { useSession } from "./session";
import { avatarColor, buildTheme, STAGE, VERDE_ESPERA } from "./theme";
import { ApiError } from "../core/errors";
import { aguardandoResposta, campanhaDe, campanhasDe, filtrarConversas, type Filtro } from "../core/inbox";
import type { ConversationRow } from "../core/contracts";

export type { Filtro };

const PAGINA = 30;
const FILTROS: Filtro[] = ["todas", "aguardando", "minhas"];
const ROTULOS = ["Todas", "Aguardando", "Minhas"];

const ROTULO_MIDIA: Record<string, string> = {
  image: "Foto", audio: "Áudio", video: "Vídeo",
  document: "Documento", sticker: "Figurinha", location: "Localização",
};

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
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  const { campanha } = useLocalSearchParams<{ campanha?: string }>();

  const [linhas, setLinhas] = useState<ConversationRow[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [campanhaSel, setCampanhaSel] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { if (campanha) setCampanhaSel(campanha); }, [campanha]);

  const carregar = useCallback(async (opts: { offset?: number; silencioso?: boolean } = {}) => {
    if (!client) return;
    const offset = opts.offset ?? 0;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;

    if (!opts.silencioso && offset === 0) setCarregando(true);
    if (offset > 0) setCarregandoMais(true);

    try {
      const r = await client.conversations({
        limit: PAGINA, offset, q: busca, onlyMine: filtro === "minhas", signal: ctrl.signal,
      });
      setLinhas((antes) => (offset === 0 ? r.conversations : [...antes, ...r.conversations]));
      setTemMais(r.hasMore);
      setErro(null);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar as conversas.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
      setCarregandoMais(false);
    }
  }, [client, busca, filtro]);

  useEffect(() => {
    const t = setTimeout(() => { void carregar(); }, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  useFocusEffect(useCallback(() => { void carregar({ silencioso: true }); }, [carregar]));

  const campanhas = useMemo(() => campanhasDe(linhas), [linhas]);

  useEffect(() => {
    if (campanhaSel && !campanhas.includes(campanhaSel)) setCampanhaSel(null);
  }, [campanhas, campanhaSel]);

  const visiveis = filtrarConversas(linhas, filtro, campanhaSel);

  const trocarFiltro = useCallback((i: number) => {
    void Haptics.selectionAsync().catch(() => {});
    setFiltro(FILTROS[i] ?? "todas");
    setCampanhaSel(null);
  }, []);

  const selecionarCampanha = useCallback((c: string | null) => {
    void Haptics.selectionAsync().catch(() => {});
    setCampanhaSel(c);
  }, []);

  const vazio =
    busca ? "Nenhuma conversa encontrada."
    : campanhaSel ? "Nenhum lead desta campanha."
    : filtro === "aguardando" ? "Nenhum lead esperando resposta."
    : filtro === "minhas" ? "Você ainda não é dona de nenhuma conversa."
    : "Nenhuma conversa ainda.";

  const renderItem = ({ item }: { item: ConversationRow }) => {
    const esperando = aguardandoResposta(item);
    const etapa = item.funnelStage ? STAGE[item.funnelStage] : null;
    const marcadores: { texto: string; cor: string }[] = [];
    if (etapa) marcadores.push({ texto: etapa.label, cor: etapa.color });
    if (item.fromAd) marcadores.push({ texto: campanhaDe(item), cor: theme.accent });
    if (item.assignedName) marcadores.push({ texto: item.assignedName, cor: theme.muted });
    for (const t of item.tags) marcadores.push({ texto: t.name, cor: t.color });

    return (
      <Pressable
        onPress={() => router.push(`/(app)/conversas/${item.contactId}`)}
        accessibilityRole="button"
        accessibilityLabel={`Conversa com ${item.name}`}
        style={({ pressed }) => [s.linha, pressed && { backgroundColor: theme.raise }]}
      >
        <View style={[s.avatar, { backgroundColor: avatarColor(item.name) }]}>
          <Text style={s.avatarTexto}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
        </View>

        <View style={s.corpo}>
          <View style={s.topo}>
            <Text style={s.nome} numberOfLines={1}>{item.name}</Text>
            <Text style={s.hora}>{horaCurta(item.lastMessageAt)}</Text>
          </View>

          <View style={s.meio}>
            <Text style={s.previa} numberOfLines={1}>
              {item.lastDirection === "out" ? "✓ " : ""}{previa(item)}
            </Text>
            {esperando ? <View style={s.pontoEspera} accessibilityLabel="Aguardando resposta" /> : null}
          </View>

          {marcadores.length > 0 ? (
            <View style={s.marcadores}>
              {marcadores.slice(0, 3).map((m, i) => (
                <Text key={`${item.contactId}-m${i}`} style={[s.marcador, { color: m.cor }]} numberOfLines={1}>
                  {m.texto}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  // Filtros rolam com a lista — padrão iOS. Não são cabeçalho fixo.
  const cabecalhoDaLista = (
    <View style={s.filtros}>
      <SegmentedControl
        values={ROTULOS}
        selectedIndex={FILTROS.indexOf(filtro)}
        onChange={(e) => trocarFiltro(e.nativeEvent.selectedSegmentIndex)}
        appearance={theme.dark ? "dark" : "light"}
      />

      {campanhas.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.campanhas}>
          <Pressable
            onPress={() => selecionarCampanha(null)}
            style={[s.campanha, !campanhaSel && { borderColor: theme.accent }]}
          >
            <Text style={[s.campanhaTexto, !campanhaSel && { color: theme.accent, fontWeight: "700" }]}>
              Todas as campanhas
            </Text>
          </Pressable>
          {campanhas.map((c) => {
            const on = campanhaSel === c;
            return (
              <Pressable
                key={c}
                onPress={() => selecionarCampanha(on ? null : c)}
                style={[s.campanha, on && { borderColor: theme.accent }]}
              >
                <Text style={[s.campanhaTexto, on && { color: theme.accent, fontWeight: "700" }]} numberOfLines={1}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
    <View style={s.tela}>
      <Stack.Screen
        options={{
          title: "Conversas",
          headerLargeTitle: true,
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/perfil")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Perfil e conta"
            >
              <User size={22} color={theme.accent} strokeWidth={2.2} />
            </Pressable>
          ),
          // Busca do SISTEMA: aparece sob o título grande, com "Cancelar" e
          // teclado próprio — não é uma caixa de texto imitando uma.
          headerSearchBarOptions: {
            placeholder: "Pesquisar",
            hideWhenScrolling: false,
            autoCapitalize: "none",
            textColor: theme.text,
            tintColor: theme.accent,
            onChangeText: (e) => setBusca(e.nativeEvent.text),
            onCancelButtonPress: () => setBusca(""),
          },
        }}
      />

      {carregando ? (
        <View style={s.centro}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList
          data={visiveis}
          keyExtractor={(c) => c.contactId}
          renderItem={renderItem}
          ListHeaderComponent={cabecalhoDaLista}
          ItemSeparatorComponent={() => <View style={s.separador} />}
          // Faz o título grande encolher e a busca se comportar como no sistema.
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={visiveis.length === 0 ? s.vazioBox : { paddingBottom: insets.bottom + 92 }}
          ListEmptyComponent={<Text style={s.vazio}>{vazio}</Text>}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => { setAtualizando(true); void carregar({ silencioso: true }); }}
              tintColor={theme.accent}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (temMais && !carregandoMais) void carregar({ offset: linhas.length }); }}
          ListFooterComponent={carregandoMais ? <ActivityIndicator style={s.rodape} color={theme.accent} /> : null}
        />
      )}
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.surface },

    filtros: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 10, backgroundColor: t.surface },
    campanhas: { gap: 6, paddingRight: 8 },
    campanha: {
      borderRadius: 20, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 11, paddingVertical: 4, maxWidth: 190, backgroundColor: t.bg,
    },
    campanhaTexto: { fontSize: 12, fontWeight: "600", color: t.muted },

    linha: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 16 },
    avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
    avatarTexto: { color: "#fff", fontWeight: "600", fontSize: 21 },
    corpo: { flex: 1, gap: 2 },
    topo: { flexDirection: "row", alignItems: "baseline", gap: 8 },
    nome: { flex: 1, fontSize: 17, fontWeight: "600", color: t.text, letterSpacing: -0.2 },
    hora: { fontSize: 12.5, color: t.waMuted },
    meio: { flexDirection: "row", alignItems: "center", gap: 8 },
    previa: { flex: 1, fontSize: 15, color: t.waMuted, letterSpacing: -0.1 },
    pontoEspera: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: VERDE_ESPERA },
    marcadores: { flexDirection: "row", gap: 10, marginTop: 1 },
    marcador: { fontSize: 11, fontWeight: "600", opacity: 0.85, maxWidth: 120 },

    separador: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 80 },
    centro: { flex: 1, alignItems: "center", justifyContent: "center" },
    vazioBox: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    vazio: { color: t.muted, fontSize: 15, textAlign: "center" },
    rodape: { paddingVertical: 16 },
    erroCaixa: { padding: 12, backgroundColor: t.critSoft, borderRadius: 10, gap: 4 },
    erroTexto: { color: t.crit, fontSize: 13 },
    tentar: { color: t.accent, fontSize: 13, fontWeight: "700" },
  });
