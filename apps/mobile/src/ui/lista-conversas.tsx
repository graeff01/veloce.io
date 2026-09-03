// ── Lista de conversas ────────────────────────────────────────────────────────
// Porte do visual de components/portal/portal-conversations.tsx: linha com borda
// esquerda de 3px (marca quando selecionada, verde quando aguardando resposta),
// avatar colorido pelo hash do NOME, nome em negrito quando o lead espera.
// Mesmas medidas e mesma hierarquia de informação do PWA.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet,
  Text, TextInput, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Megaphone, Search, User, UserRound } from "lucide-react-native";
import { useSession } from "./session";
import { avatarColor, buildTheme, STAGE, VERDE_ESPERA } from "./theme";
import { ApiError } from "../core/errors";
import type { ConversationRow } from "../core/contracts";

const PAGINA = 30;

export type Filtro = "todas" | "aguardando" | "anuncios";

/** "Aguardando resposta": a última mensagem foi do LEAD e ninguém respondeu. */
const aguardando = (c: ConversationRow) => c.lastDirection != null && c.lastDirection !== "out";

const ROTULO_MIDIA: Record<string, string> = {
  image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo",
  document: "📎 Documento", sticker: "Figurinha", location: "📍 Localização",
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
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ListaConversas({ filtro, titulo }: { filtro: Filtro; titulo: string }) {
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
      const r = await client.conversations({ limit: PAGINA, offset, q: busca, onlyMine: soMinhas, signal: ctrl.signal });
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
  }, [client, busca, soMinhas]);

  useEffect(() => {
    const t = setTimeout(() => { void carregar(); }, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  useFocusEffect(useCallback(() => { void carregar({ silencioso: true }); }, [carregar]));

  // Os filtros da barra são os mesmos do PWA (?tab=waiting / ?tab=ads).
  const visiveis = linhas.filter((c) =>
    filtro === "aguardando" ? aguardando(c) : filtro === "anuncios" ? c.fromAd : true,
  );

  const vazio =
    busca ? "Nenhuma conversa encontrada."
    : filtro === "aguardando" ? "Nenhum lead esperando resposta."
    : filtro === "anuncios" ? "Nenhum lead vindo de anúncio."
    : soMinhas ? "Você ainda não é dona de nenhuma conversa."
    : "Nenhuma conversa ainda.";

  const renderItem = ({ item }: { item: ConversationRow }) => {
    const esperando = aguardando(item);
    const etapa = item.funnelStage ? STAGE[item.funnelStage] : null;

    return (
      <Pressable
        onPress={() => router.push(`/(app)/conversas/${item.contactId}`)}
        accessibilityRole="button"
        accessibilityLabel={`Conversa com ${item.name}`}
        style={({ pressed }) => [
          s.linha,
          { borderLeftColor: esperando ? VERDE_ESPERA : "transparent" },
          esperando && { backgroundColor: "rgba(31,168,85,0.05)" },
          pressed && { backgroundColor: theme.accentSoft },
        ]}
      >
        <View style={[s.avatar, { backgroundColor: avatarColor(item.name) }]}>
          <Text style={s.avatarTexto}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
        </View>

        <View style={s.corpo}>
          <View style={s.linhaTopo}>
            <Text style={[s.nome, esperando && s.nomeEsperando]} numberOfLines={1}>{item.name}</Text>
            <Text style={s.hora}>{horaCurta(item.lastMessageAt)}</Text>
          </View>

          <Text style={s.previa} numberOfLines={1}>{previa(item)}</Text>

          {(etapa || item.fromAd || item.assignedName || item.tags.length > 0) ? (
            <View style={s.chips}>
              {etapa ? <Chip texto={etapa.label} cor={etapa.color} /> : null}
              {item.fromAd ? (
                <Chip
                  texto={item.adModel || item.adTitle || "Anúncio"}
                  cor={theme.accent}
                  icone={<Megaphone size={9} color={theme.accent} strokeWidth={2.6} />}
                />
              ) : null}
              {item.assignedName ? (
                <Chip
                  texto={item.assignedName}
                  cor={theme.muted}
                  icone={<UserRound size={9} color={theme.muted} strokeWidth={2.6} />}
                />
              ) : null}
              {item.tags.map((t) => <Chip key={t.id} texto={t.name} cor={t.color} />)}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={s.tela}>
      <View style={[s.cabecalho, { paddingTop: insets.top + 10 }]}>
        <View style={s.tituloLinha}>
          <Text style={s.titulo} numberOfLines={1}>{titulo}</Text>
          {/* Perfil/sair: no PWA fica na casca, não na barra inferior. */}
          <Pressable
            onPress={() => router.push("/(app)/perfil")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Perfil e conta"
            style={s.perfilBotao}
          >
            <User size={18} color={theme.muted} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={s.buscaBox}>
          <Search size={15} color={theme.muted} strokeWidth={2.2} />
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
        </View>

        {me?.user ? (
          <Pressable
            onPress={() => setSoMinhas((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: soMinhas }}
            style={[s.filtro, soMinhas && { backgroundColor: theme.accent, borderColor: theme.accent }]}
          >
            <UserRound size={12} color={soMinhas ? theme.onAccent : theme.muted} strokeWidth={2.4} />
            <Text style={[s.filtroTexto, soMinhas && { color: theme.onAccent, fontWeight: "700" }]}>Minhas</Text>
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
          data={visiveis}
          keyExtractor={(c) => c.contactId}
          renderItem={renderItem}
          contentContainerStyle={
            visiveis.length === 0 ? s.vazioBox : { paddingBottom: insets.bottom + 92 }
          }
          ListEmptyComponent={<Text style={s.vazio}>{vazio}</Text>}
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

function Chip({ texto, cor, icone }: { texto: string; cor: string; icone?: React.ReactNode }) {
  return (
    <View style={[chipStyles.box, { borderColor: cor }]}>
      {icone}
      <Text style={[chipStyles.texto, { color: cor }]} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  box: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 1.5,
  },
  texto: { fontSize: 10.5, fontWeight: "700" },
});

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.surface },
    cabecalho: {
      paddingHorizontal: 16, paddingBottom: 11, gap: 9,
      backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    tituloLinha: { flexDirection: "row", alignItems: "center", gap: 10 },
    titulo: { flex: 1, fontSize: 21, fontWeight: "800", color: t.text, letterSpacing: -0.4 },
    perfilBotao: {
      width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: t.border, backgroundColor: t.bg,
    },
    buscaBox: {
      flexDirection: "row", alignItems: "center", gap: 7,
      backgroundColor: t.bg, borderRadius: 10, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 11,
    },
    busca: { flex: 1, paddingVertical: 9, fontSize: 14.5, color: t.text },
    filtro: {
      flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
      borderRadius: 20, borderWidth: 1, borderColor: t.border, paddingHorizontal: 11, paddingVertical: 4.5,
    },
    filtroTexto: { fontSize: 12, fontWeight: "600", color: t.muted },

    // Linha: mesmas medidas do PWA (padding 13/16, borda esquerda de 3px).
    linha: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingVertical: 13, paddingHorizontal: 16,
      borderBottomWidth: 1, borderBottomColor: t.border,
      borderLeftWidth: 3,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    avatarTexto: { color: "#fff", fontWeight: "700", fontSize: 17.6 },
    corpo: { flex: 1, gap: 2 },
    linhaTopo: { flexDirection: "row", alignItems: "center", gap: 8 },
    nome: { flex: 1, fontSize: 14.5, fontWeight: "600", color: t.text },
    nomeEsperando: { fontWeight: "800" },
    hora: { fontSize: 11.5, color: t.muted },
    previa: { fontSize: 13, color: t.muted },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 3 },

    centro: { flex: 1, alignItems: "center", justifyContent: "center" },
    vazioBox: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    vazio: { color: t.muted, fontSize: 14.5, textAlign: "center" },
    rodape: { paddingVertical: 16 },
    erroCaixa: { padding: 12, backgroundColor: t.critSoft, gap: 4 },
    erroTexto: { color: t.crit, fontSize: 13 },
    tentar: { color: t.accent, fontSize: 13, fontWeight: "700" },
  });
