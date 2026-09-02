import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet,
  Text, TextInput, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../../../src/ui/session";
import { STAGE_LABEL, buildTheme } from "../../../src/ui/theme";
import { ApiError } from "../../../src/core/errors";
import type { ConversationRow } from "../../../src/core/contracts";

const PAGINA = 30;

export default function Conversas() {
  const { client, me } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  const [linhas, setLinhas] = useState<ConversationRow[]>([]);
  const [busca, setBusca] = useState("");
  const [soMinhas, setSoMinhas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

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
        limit: PAGINA, offset, q: busca, onlyMine: soMinhas, signal: ctrl.signal,
      });
      setLinhas((antes) => (offset === 0 ? r.conversations : [...antes, ...r.conversations]));
      setTemMais(r.hasMore);
      setErro(null);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      // 401 já derruba a sessão pelo cliente; aqui só mostramos o que dá para agir.
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar as conversas.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
      setCarregandoMais(false);
    }
  }, [client, busca, soMinhas]);

  // Busca com respiro: não dispara uma chamada por tecla.
  useEffect(() => {
    const t = setTimeout(() => { void carregar(); }, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  // Voltar do background ou de uma conversa reconcilia a lista com o servidor.
  // Sem polling agressivo: o push é quem avisa que chegou mensagem.
  useFocusEffect(useCallback(() => { void carregar({ silencioso: true }); }, [carregar]));

  const aguardando = (c: ConversationRow) => c.lastDirection != null && c.lastDirection !== "out";

  const renderItem = ({ item }: { item: ConversationRow }) => (
    <Pressable
      style={s.linha}
      onPress={() => router.push(`/(app)/conversas/${item.contactId}`)}
      accessibilityRole="button"
      accessibilityLabel={`Conversa com ${item.name}`}
    >
      <View style={[s.avatar, { backgroundColor: theme.accent }]}>
        <Text style={[s.avatarTexto, { color: theme.accentText }]}>{item.name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={s.corpo}>
        <View style={s.linhaTopo}>
          <Text style={s.nome} numberOfLines={1}>{item.name}</Text>
          <Text style={s.hora}>{horaCurta(item.lastMessageAt)}</Text>
        </View>
        <View style={s.linhaBaixo}>
          <Text style={[s.previa, aguardando(item) && s.previaForte]} numberOfLines={1}>
            {previa(item)}
          </Text>
          {aguardando(item) ? <View style={s.pontoEspera} /> : null}
        </View>
        <View style={s.chips}>
          {item.funnelStage ? <Chip texto={STAGE_LABEL[item.funnelStage] ?? item.funnelStage} theme={theme} /> : null}
          {item.fromAd ? <Chip texto={item.adModel || item.adTitle || "Anúncio"} theme={theme} destaque /> : null}
          {item.assignedName ? <Chip texto={item.assignedName} theme={theme} /> : null}
          {item.tags.map((t) => <Chip key={t.id} texto={t.name} theme={theme} cor={t.color} />)}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={[s.tela, { paddingTop: insets.top }]}>
      <View style={s.cabecalho}>
        <Text style={s.titulo}>{me?.brand.name ?? "Conversas"}</Text>
        <TextInput
          style={s.busca}
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por nome ou telefone"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {me?.user ? (
          <Pressable
            style={[s.filtro, soMinhas && s.filtroAtivo]}
            onPress={() => setSoMinhas((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: soMinhas }}
          >
            <Text style={[s.filtroTexto, soMinhas && s.filtroTextoAtivo]}>Só minhas</Text>
          </Pressable>
        ) : null}
      </View>

      {erro ? (
        <View style={s.erroCaixa}>
          <Text style={s.erroTexto}>{erro}</Text>
          <Pressable onPress={() => void carregar()}><Text style={s.tentar}>Tentar de novo</Text></Pressable>
        </View>
      ) : null}

      {carregando ? (
        <View style={s.centro}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList
          data={linhas}
          keyExtractor={(c) => c.contactId}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={s.separador} />}
          contentContainerStyle={linhas.length === 0 ? s.vazioBox : { paddingBottom: insets.bottom + 16 }}
          ListEmptyComponent={
            <Text style={s.vazio}>
              {busca ? "Nenhuma conversa encontrada." : soMinhas ? "Você ainda não é dona de nenhuma conversa." : "Nenhuma conversa ainda."}
            </Text>
          }
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

function Chip({ texto, theme, cor, destaque }: { texto: string; theme: ReturnType<typeof buildTheme>; cor?: string; destaque?: boolean }) {
  const base = cor ?? (destaque ? theme.accent : theme.muted);
  return (
    <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: base }}>
      <Text style={{ fontSize: 10.5, fontWeight: "700", color: base }} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

const ROTULO_MIDIA: Record<string, string> = {
  image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo",
  document: "📎 Documento", sticker: "Figurinha", location: "📍 Localização",
};

function previa(c: ConversationRow): string {
  const t = c.lastText?.trim();
  if (t) return t;
  return (c.lastType && ROTULO_MIDIA[c.lastType]) || "—";
}

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
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    cabecalho: { paddingHorizontal: 16, paddingBottom: 10, gap: 10, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border },
    titulo: { fontSize: 24, fontWeight: "800", color: t.text, marginTop: 6 },
    busca: {
      backgroundColor: t.bg, borderRadius: 10, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: t.text,
    },
    filtro: { alignSelf: "flex-start", borderRadius: 20, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, paddingVertical: 5 },
    filtroAtivo: { backgroundColor: t.accent, borderColor: t.accent },
    filtroTexto: { fontSize: 12.5, fontWeight: "600", color: t.muted },
    filtroTextoAtivo: { color: t.accentText },
    linha: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 72 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    avatarTexto: { fontSize: 17, fontWeight: "700" },
    corpo: { flex: 1, gap: 3 },
    linhaTopo: { flexDirection: "row", alignItems: "center", gap: 8 },
    nome: { flex: 1, fontSize: 16, fontWeight: "600", color: t.text },
    hora: { fontSize: 12, color: t.muted },
    linhaBaixo: { flexDirection: "row", alignItems: "center", gap: 6 },
    previa: { flex: 1, fontSize: 14, color: t.muted },
    previaForte: { color: t.text, fontWeight: "600" },
    pontoEspera: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.good },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
    separador: { height: 1, backgroundColor: t.border, marginLeft: 72 },
    centro: { flex: 1, alignItems: "center", justifyContent: "center" },
    vazioBox: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    vazio: { color: t.muted, fontSize: 15, textAlign: "center" },
    rodape: { paddingVertical: 16 },
    erroCaixa: { padding: 12, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border, gap: 4 },
    erroTexto: { color: t.danger, fontSize: 13 },
    tentar: { color: t.accent, fontSize: 13, fontWeight: "700" },
  });
