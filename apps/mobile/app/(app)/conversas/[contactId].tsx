import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS, ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
  useAudioPlayer, useAudioPlayerStatus, useAudioRecorder,
} from "expo-audio";
import { SIMBOLO, Simbolo } from "../../../src/ui/simbolo";
import { TIPO } from "../../../src/ui/tipografia";
import { useSession } from "../../../src/ui/session";
import { AZUL_LIDO, avatarColor, buildTheme, STAGE } from "../../../src/ui/theme";
import { midiaDaMensagem } from "../../../src/ui/media";
import { useConversaAoVivo } from "../../../src/ui/stream";
import { marcarLida } from "../../../src/ui/cache";
import { ApiError } from "../../../src/core/errors";
import type { Conversation, Message, Tag } from "../../../src/core/contracts";
import { lerLidas } from "../../../src/ui/cache";

// ── Thread ────────────────────────────────────────────────────────────────────
// Visual portado do portal: fundo do chat na cor do WhatsApp, balão recebido
// branco com o canto superior-ESQUERDO reto, enviado na cor da marca com o
// canto superior-DIREITO reto, raio 8, texto 13.5.

type Item =
  | { tipo: "dia"; id: string; rotulo: string }
  | { tipo: "naolidas"; id: string }
  | { tipo: "msg"; id: string; msg: Message; pendente?: boolean };

function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "HOJE";
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "ONTEM";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const mmss = (s: number) => {
  const seg = Math.max(0, Math.floor(s));
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
};

/** Vibração curta. Best-effort: nunca pode atrapalhar a ação em si. */
const vibrar = (estilo: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  void Haptics.impactAsync(estilo).catch(() => {});
};

export default function Thread() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const { client, me } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  const [conversa, setConversa] = useState<Conversation | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  // Mensagens que JÁ apareceram na tela mas ainda não voltaram do servidor.
  const [pendentes, setPendentes] = useState<Message[]>([]);
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  const [longe, setLonge] = useState(false);   // rolado para cima
  const lista = useRef<FlatList<Item>>(null);
  // A última visita é lida ANTES de marcar como lida — senão o divisor nunca
  // apareceria, porque abrir a conversa já a marcaria.
  const visitaAnterior = useRef<string | undefined>(
    contactId ? lerLidas()[String(contactId)] : undefined,
  );

  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  /** Folha de ações do iOS. Nativa: é o menu que a pessoa já conhece. */
  const folha = useCallback((titulo: string, opcoes: string[], aoEscolher: (i: number) => void, destrutivo?: number) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: titulo,
        options: [...opcoes, "Cancelar"],
        cancelButtonIndex: opcoes.length,
        destructiveButtonIndex: destrutivo,
        userInterfaceStyle: theme.dark ? "dark" : "light",
      },
      (i) => { if (i < opcoes.length) aoEscolher(i); },
    );
  }, [theme.dark]);


  const carregar = useCallback(async (silencioso = false) => {
    if (!client || !contactId) return;
    if (!silencioso) setCarregando(true);
    try {
      setConversa(await client.conversation(contactId));
      setPendentes([]); // o servidor já devolveu o que estava pendente
      setErro(null);
    } catch (e) {
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível abrir a conversa.");
    } finally {
      setCarregando(false);
    }
  }, [client, contactId]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Abrir a conversa é o que a marca como lida.
  useEffect(() => { if (contactId) marcarLida(String(contactId)); }, [contactId]);
  useFocusEffect(useCallback(() => { void carregar(true); }, [carregar]));

  // Mensagem nova do lead chega SOZINHA na tela, sem sair e voltar.
  useConversaAoVivo(client, contactId ? String(contactId) : null, useCallback(() => {
    void carregar(true);
  }, [carregar]));

  // Agrupa por dia, como o portal. As pendentes entram no fim, já visíveis.
  const itens = useMemo<Item[]>(() => {
    if (!conversa) return [];
    const todas = [...conversa.items, ...pendentes];
    const corte = visitaAnterior.current ? Date.parse(visitaAnterior.current) : null;
    let divisorPosto = false;
    const out: Item[] = [];
    let diaAtual = "";
    for (const m of todas) {
      const dia = new Date(m.timestamp).toDateString();
      if (dia !== diaAtual) {
        diaAtual = dia;
        out.push({ tipo: "dia", id: `dia-${dia}`, rotulo: rotuloDoDia(m.timestamp) });
      }
      // Divisor antes da primeira mensagem do LEAD que chegou depois da última
      // visita — a linha que o WhatsApp usa para você saber onde parou.
      if (!divisorPosto && corte && m.direction === "in" && Date.parse(m.timestamp) > corte) {
        divisorPosto = true;
        out.push({ tipo: "naolidas", id: "divisor-naolidas" });
      }
      out.push({ tipo: "msg", id: m.id, msg: m, pendente: m.id.startsWith("local-") });
    }
    return out;
  }, [conversa, pendentes]);

  // ── Envio otimista ──────────────────────────────────────────────────────────
  // A mensagem aparece na hora, esmaecida e com relógio; some se o envio falhar.
  // Antes o app esperava o servidor e só então recarregava — em rede ruim parecia
  // travado, e a vendedora não sabia se tinha enviado.
  const enviarTexto = useCallback(async () => {
    const t = texto.trim();
    if (!client || !contactId || !t || enviando) return;

    const local: Message = {
      id: `local-${Date.now()}`,
      text: t, direction: "out", type: "text",
      timestamp: new Date().toISOString(),
      aiGenerated: false, sentByName: conversa?.meName ?? null,
      transcription: null, deliveredAt: null, readAt: null, reaction: null,
    };

    vibrar();
    setTexto("");
    setPendentes((p) => [...p, local]);
    setEnviando(true);
    try {
      await client.sendText(contactId, t);
      await carregar(true);
    } catch (e) {
      setPendentes((p) => p.filter((m) => m.id !== local.id));
      setTexto(t); // devolve o que a pessoa escreveu — nada se perde
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Não enviou", e instanceof ApiError ? e.message : "Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }, [client, contactId, texto, enviando, conversa, carregar]);

  const enviarImagem = useCallback(async (daCamera: boolean) => {
    if (!client || !contactId) return;
    const perm = daCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão necessária", daCamera ? "Libere a câmera nos Ajustes." : "Libere as fotos nos Ajustes.");
      return;
    }
    const r = daCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;

    const asset = r.assets[0];
    const form = new FormData();
    form.append("file", {
      uri: asset.uri, name: asset.fileName ?? "foto.jpg", type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
    form.append("kind", "image");

    vibrar();
    setEnviando(true);
    try {
      await client.sendMedia(contactId, form);
      await carregar(true);
    } catch (e) {
      Alert.alert("Não enviou", e instanceof ApiError ? e.message : "Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }, [client, contactId, carregar]);

  const enviarDocumento = useCallback(async () => {
    if (!client || !contactId) return;
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }).catch(() => null);
    if (!r || r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];

    const form = new FormData();
    form.append("file", {
      uri: a.uri, name: a.name || "documento", type: a.mimeType || "application/octet-stream",
    } as unknown as Blob);
    form.append("kind", "document");

    vibrar();
    setEnviando(true);
    try {
      await client.sendMedia(String(contactId), form);
      await carregar(true);
    } catch (e) {
      Alert.alert("Não enviou", e instanceof ApiError ? e.message : "Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }, [client, contactId, carregar]);

  /** O clipe abre a escolha: foto ou arquivo. */
  const escolherAnexo = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    folha("Anexar", ["Foto da galeria", "Documento"], (i) => {
      if (i === 0) void enviarImagem(false);
      else void enviarDocumento();
    });
  }, [folha, enviarImagem, enviarDocumento]);

  const alternarGravacao = useCallback(async () => {
    if (!client || !contactId) return;
    if (gravando) {
      vibrar(Haptics.ImpactFeedbackStyle.Medium);
      setGravando(false);
      await gravador.stop();
      const uri = gravador.uri;
      if (!uri) return;
      const form = new FormData();
      // HIGH_QUALITY no iOS grava .m4a (audio/mp4) — aceito pela Cloud API e o
      // mesmo contêiner que o Safari produzia no PWA.
      form.append("file", { uri, name: "audio.m4a", type: "audio/mp4" } as unknown as Blob);
      form.append("kind", "audio");
      setEnviando(true);
      try {
        await client.sendMedia(contactId, form);
        await carregar(true);
      } catch (e) {
        Alert.alert("Não enviou", e instanceof ApiError ? e.message : "Tente de novo.");
      } finally {
        setEnviando(false);
      }
      return;
    }

    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão necessária", "Libere o microfone nos Ajustes para gravar áudio.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await gravador.prepareToRecordAsync();
    gravador.record();
    vibrar(Haptics.ImpactFeedbackStyle.Medium);
    setGravando(true);
  }, [client, contactId, gravando, gravador, carregar]);

  const mudarEtapa = useCallback(() => {
    const chaves = Object.keys(STAGE);
    folha("Etapa do funil", chaves.map((k) => STAGE[k]!.label), async (i) => {
      if (!client || !contactId) return;
      try {
        await client.setFunnelStage(String(contactId), chaves[i]!);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await carregar(true);
      } catch (e) {
        Alert.alert("Não deu", e instanceof ApiError ? e.message : "Tente de novo.");
      }
    });
  }, [folha, client, contactId, carregar]);

  const transferir = useCallback(() => {
    if (!conversa?.attendants.length) return;
    const pessoas = conversa.attendants;
    folha("Dono da conversa", [...pessoas.map((a) => a.name), "Remover dono"], async (i) => {
      if (!client || !contactId) return;
      const alvo = i < pessoas.length ? pessoas[i]!.email : null;
      try {
        await client.assign(String(contactId), alvo);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await carregar(true);
      } catch (e) {
        Alert.alert("Não deu", e instanceof ApiError ? e.message : "Tente de novo.");
      }
    }, pessoas.length);
  }, [folha, conversa, client, contactId, carregar]);

  const editarEtiquetas = useCallback(async () => {
    if (!client || !contactId || !conversa) return;
    let disponiveis: Tag[] = [];
    try { disponiveis = await client.tags(); } catch { return; }
    if (!disponiveis.length) { Alert.alert("Sem etiquetas", "Crie etiquetas no painel web primeiro."); return; }

    const aplicadas = new Set(conversa.tags.map((t) => t.id));
    folha("Etiquetas", disponiveis.map((t) => `${aplicadas.has(t.id) ? "✓  " : ""}${t.name}`), async (i) => {
      const t = disponiveis[i]!;
      try {
        if (aplicadas.has(t.id)) await client.removeTag(String(contactId), t.id);
        else await client.addTag(String(contactId), t.id);
        void Haptics.selectionAsync().catch(() => {});
        await carregar(true);
      } catch (e) {
        Alert.alert("Não deu", e instanceof ApiError ? e.message : "Tente de novo.");
      }
    });
  }, [folha, client, contactId, conversa, carregar]);

  const pedirIa = useCallback(() => {
    Alert.alert(
      "A IA responde este lead?",
      "Ela vai redigir e ENVIAR a próxima resposta no WhatsApp.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Pode responder",
          onPress: async () => {
            if (!client || !contactId) return;
            setEnviando(true);
            try {
              await client.aiReply(String(contactId));
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              await carregar(true);
            } catch (e) {
              Alert.alert("Não deu", e instanceof ApiError ? e.message : "Tente de novo.");
            } finally {
              setEnviando(false);
            }
          },
        },
      ],
    );
  }, [client, contactId, carregar]);

  const menu = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    folha(conversa?.contact.name ?? "Conversa",
      ["IA responder este lead", "Etapa do funil", "Etiquetas", "Dono da conversa"],
      (i) => {
        if (i === 0) pedirIa();
        else if (i === 1) mudarEtapa();
        else if (i === 2) void editarEtiquetas();
        else transferir();
      });
  }, [folha, conversa, pedirIa, mudarEtapa, editarEtiquetas, transferir]);

  const assumir = useCallback(async () => {
    if (!client || !contactId || !conversa?.me) return;
    try {
      await client.assign(contactId, conversa.me);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await carregar(true);
    } catch (e) {
      Alert.alert("Não deu", e instanceof ApiError ? e.message : "Tente de novo.");
    }
  }, [client, contactId, conversa, carregar]);

  if (carregando) {
    return <View style={[s.tela, s.centro]}><ActivityIndicator color={theme.accent} /></View>;
  }

  if (erro || !conversa) {
    return (
      <View style={[s.tela, s.centro, { padding: 24, gap: 12 }]}>
        <Text style={s.erroTexto}>{erro ?? "Conversa indisponível."}</Text>
        <Pressable onPress={() => void carregar()}><Text style={s.tentar}>Tentar de novo</Text></Pressable>
        <Pressable onPress={() => router.back()}><Text style={s.tentar}>Voltar</Text></Pressable>
      </View>
    );
  }

  const minha = !!conversa.assignedEmail && conversa.assignedEmail === conversa.me;
  const podeEnviar = conversa.windowOpen && !enviando;
  const etapa = conversa.funnelStage ? STAGE[conversa.funnelStage] : null;

  return (
    <KeyboardAvoidingView style={s.tela} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Header NATIVO: o botão voltar e o gesto de arrastar da borda vêm da
          pilha, não de um botão desenhado. É o que faz a tela parecer empurrada
          e não trocada. */}
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={s.tituloNav}>
              <View style={[s.avatarPeq, { backgroundColor: avatarColor(conversa.contact.name) }]}>
                <Text style={s.avatarPeqTexto} maxFontSizeMultiplier={1.2}>{conversa.contact.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={s.tituloNavCorpo}>
                <Text style={s.nome} numberOfLines={1}>{conversa.contact.name}</Text>
                <View style={s.subLinha}>
                  {etapa ? <Text style={[s.subtitulo, { color: etapa.color, fontWeight: "700" }]}>{etapa.label}</Text> : null}
                  {conversa.assignedName ? (
                    <>
                      {etapa ? <Text style={s.subtitulo}>·</Text> : null}
                              <Text style={s.subtitulo} numberOfLines={1}>{conversa.assignedName}</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>
          ),
          headerRight: () => (
            <View style={s.acoesTopo}>
              {!minha && conversa.me ? (
                <Pressable onPress={() => void assumir()} hitSlop={8} accessibilityRole="button">
                  <Text style={s.assumirTexto}>Assumir</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={menu} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mais ações">
                <Simbolo nome={"ellipsis.circle" as never} tamanho={24} cor={theme.accent} />
              </Pressable>
            </View>
          ),
        }}
      />

      <FlatList
        ref={lista}
        data={itens}
        keyExtractor={(i) => i.id}
        style={s.chat}
        contentContainerStyle={s.chatConteudo}
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          conversa.lead ? (
            <View style={s.origem}>
              <Simbolo nome={SIMBOLO.anuncios as never} tamanho={12} cor={theme.accent} />
              <Text style={s.origemTexto} numberOfLines={1}>
                {conversa.lead.adModel || conversa.lead.adTitle || "Veio de anúncio"}
              </Text>
            </View>
          ) : null
        }
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          setLonge(contentSize.height - contentOffset.y - layoutMeasurement.height > 260);
        }}
        scrollEventThrottle={64}
        renderItem={({ item }) =>
          item.tipo === "dia" ? (
            <View style={s.diaLinha}>
              <Text style={s.diaTexto} maxFontSizeMultiplier={1.3}>{item.rotulo}</Text>
            </View>
          ) : item.tipo === "naolidas" ? (
            <View style={s.naoLidasLinha}>
              <View style={s.naoLidasRisco} />
              <Text style={s.naoLidasTexto} maxFontSizeMultiplier={1.3}>MENSAGENS NÃO LIDAS</Text>
              <View style={s.naoLidasRisco} />
            </View>
          ) : (
            <Balao
              msg={item.msg}
              pendente={!!item.pendente}
              theme={theme}
              contactId={String(contactId)}
              aoAbrirImagem={setImagemAberta}
            />
          )
        }
        onContentSizeChange={() => lista.current?.scrollToEnd({ animated: false })}
      />

      {longe ? (
        <Pressable
          style={s.descer}
          onPress={() => lista.current?.scrollToEnd({ animated: true })}
          accessibilityRole="button"
          accessibilityLabel="Ir para a última mensagem"
        >
          <Simbolo nome={"chevron.down" as never} tamanho={16} cor={theme.text} peso="semibold" />
        </Pressable>
      ) : null}

      {!conversa.windowOpen ? (
        <View style={s.janelaFechada}>
          <Text style={s.janelaTexto}>
            Fora da janela de 24h do WhatsApp. Aguarde o lead escrever para responder.
          </Text>
        </View>
      ) : null}

      <View style={[s.barra, { paddingBottom: insets.bottom + 9 }]}>
        <Pressable onPress={escolherAnexo} disabled={!podeEnviar} hitSlop={8} accessibilityLabel="Anexar">
          <View style={!podeEnviar && s.off}><Simbolo nome={SIMBOLO.anexo as never} tamanho={25} cor={theme.muted} /></View>
        </Pressable>
        <Pressable onPress={() => void enviarImagem(true)} disabled={!podeEnviar} hitSlop={8} accessibilityLabel="Câmera">
          <View style={!podeEnviar && s.off}><Simbolo nome={SIMBOLO.camera as never} tamanho={24} cor={theme.muted} /></View>
        </Pressable>

        <TextInput
          style={s.entrada}
          value={texto}
          onChangeText={setTexto}
          placeholder={conversa.windowOpen ? "Mensagem" : "Janela fechada"}
          placeholderTextColor={theme.waMuted}
          editable={podeEnviar}
          multiline
        />

        {texto.trim() ? (
          <Pressable
            onPress={() => void enviarTexto()}
            disabled={!podeEnviar}
            style={[s.enviar, !podeEnviar && s.off]}
            accessibilityLabel="Enviar"
          >
            <Simbolo nome={SIMBOLO.enviar as never} tamanho={30} cor={theme.onAccent} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void alternarGravacao()}
            disabled={!podeEnviar}
            style={[s.enviar, { backgroundColor: gravando ? theme.crit : theme.accent }, gravando && s.gravando, !podeEnviar && s.off]}
            accessibilityLabel={gravando ? "Parar gravação" : "Gravar áudio"}
          >
            <Simbolo
              nome={(gravando ? SIMBOLO.parar : SIMBOLO.microfone) as never}
              tamanho={gravando ? 26 : 22}
              cor={gravando ? "#fff" : theme.onAccent}
            />
          </Pressable>
        )}
      </View>

      {/* Foto em tela cheia — tocar na miniatura abre aqui. */}
      <Modal visible={!!imagemAberta} transparent animationType="fade" onRequestClose={() => setImagemAberta(null)}>
        <Pressable style={s.visor} onPress={() => setImagemAberta(null)} accessibilityLabel="Fechar foto">
          <View style={[s.visorFechar, { top: insets.top + 10 }]}>
            <Simbolo nome={SIMBOLO.fechar as never} tamanho={24} cor="#fff" peso="semibold" />
          </View>
          {imagemAberta ? (
            <Image source={{ uri: imagemAberta }} style={s.visorImagem} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Áudio recebido ────────────────────────────────────────────────────────────
// A nota de voz do lead toca DENTRO do app. Antes só aparecia a transcrição — e
// nem todo áudio tem uma. O arquivo é baixado com credencial e tocado do cache.
function BolhaAudio({ uri, cor, corMeta, duracaoTexto }: {
  uri: string | null; cor: string; corMeta: string; duracaoTexto: string;
}) {
  const player = useAudioPlayer(uri ?? undefined);
  const status = useAudioPlayerStatus(player);

  const alternar = useCallback(() => {
    if (!uri) return;
    vibrar();
    if (status.playing) { player.pause(); return; }
    if (status.didJustFinish) void player.seekTo(0);
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player.play();
  }, [uri, status.playing, status.didJustFinish, player]);

  const total = status.duration || 0;
  const progresso = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  return (
    <Pressable
      onPress={alternar}
      disabled={!uri}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? "Pausar áudio" : "Tocar áudio"}
      style={audioStyles.linha}
    >
      <View style={[audioStyles.botao, { borderColor: cor }]}>
        {!uri
          ? <ActivityIndicator size="small" color={cor} />
          : <Simbolo nome={(status.playing ? SIMBOLO.pausar : SIMBOLO.tocar) as never} tamanho={14} cor={cor} />}
      </View>
      <View style={audioStyles.trilhaWrap}>
        <View style={[audioStyles.trilha, { backgroundColor: corMeta }]}>
          <View style={[audioStyles.preenchida, { backgroundColor: cor, width: `${progresso * 100}%` }]} />
        </View>
        <Text style={[audioStyles.tempo, { color: corMeta }]}>
          {status.playing || status.currentTime > 0 ? mmss(status.currentTime) : duracaoTexto}
        </Text>
      </View>
    </Pressable>
  );
}

const audioStyles = StyleSheet.create({
  linha: { flexDirection: "row", alignItems: "center", gap: 9, minWidth: 168, paddingVertical: 2 },
  trilhaWrap: { flex: 1, gap: 4 },
  botao: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  trilha: { height: 3, borderRadius: 2, opacity: 0.45, overflow: "hidden" },
  preenchida: { height: 3, borderRadius: 2 },
  tempo: { fontSize: 10.5, fontVariant: ["tabular-nums"] },
});

function Balao({ msg, pendente, theme, contactId, aoAbrirImagem }: {
  msg: Message;
  pendente: boolean;
  theme: ReturnType<typeof buildTheme>;
  contactId: string;
  aoAbrirImagem: (uri: string) => void;
}) {
  const { client } = useSession();
  const [midia, setMidia] = useState<string | null>(null);
  const s = styles(theme);
  const saiu = msg.direction === "out";

  const ehImagem = msg.type === "image" || msg.type === "sticker";
  const ehAudio = msg.type === "audio";
  const ehArquivo = msg.type === "document" || msg.type === "video";

  useEffect(() => {
    if (pendente || !client || (!ehImagem && !ehAudio)) return;
    let vivo = true;
    void midiaDaMensagem(client, contactId, msg.id, ehAudio ? "audio" : "image")
      .then((uri) => { if (vivo) setMidia(uri); })
      .catch(() => { /* falhou: o rótulo/transcrição abaixo seguem legíveis */ });
    return () => { vivo = false; };
  }, [client, contactId, msg.id, ehImagem, ehAudio, pendente]);

  const corTexto = saiu ? theme.onAccent : theme.waText;
  const corMeta = saiu ? theme.onAccent : theme.waMuted;
  const autor = saiu ? (msg.aiGenerated ? "IA" : msg.sentByName || "Equipe") : null;

  return (
    <View style={[s.balaoLinha, msg.reaction && s.balaoComReacao, { justifyContent: saiu ? "flex-end" : "flex-start" }]}>
      <View
        style={[
          s.balao,
          saiu
            ? { backgroundColor: theme.accent, borderTopLeftRadius: 8, borderTopRightRadius: 0 }
            : { backgroundColor: theme.waIn, borderTopLeftRadius: 0, borderTopRightRadius: 8 },
          pendente && s.balaoPendente,
        ]}
      >
        {ehImagem && midia ? (
          <Pressable onPress={() => aoAbrirImagem(midia)} accessibilityRole="imagebutton" accessibilityLabel="Abrir foto">
            <Image source={{ uri: midia }} style={s.imagem} resizeMode="cover" />
          </Pressable>
        ) : null}

        {ehAudio ? (
          <BolhaAudio uri={midia} cor={corTexto} corMeta={corMeta} duracaoTexto="áudio" />
        ) : null}

        {/* Documento e vídeo: antes viravam só a palavra "Documento". Agora
            abrem no visualizador do sistema. */}
        {ehArquivo ? (
          <Pressable
            onPress={async () => {
              if (!client) return;
              try {
                const uri = await midiaDaMensagem(client, contactId, msg.id, msg.type);
                if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
              } catch {
                Alert.alert("Arquivo indisponível", "Não foi possível abrir agora.");
              }
            }}
            style={s.arquivo}
            accessibilityRole="button"
          >
            <Simbolo
              nome={(msg.type === "video" ? "play.rectangle.fill" : "doc.fill") as never}
              tamanho={22}
              cor={corTexto}
            />
            <Text style={[s.arquivoTexto, { color: corTexto }]} numberOfLines={1}>
              {msg.text?.trim() || (msg.type === "video" ? "Vídeo" : "Documento")}
            </Text>
          </Pressable>
        ) : null}

        {msg.transcription ? (
          <Text style={[s.transcricao, { color: corMeta }]}>“{msg.transcription}”</Text>
        ) : null}

        {msg.text && !ehArquivo ? <Text style={[s.textoBalao, { color: corTexto }]}>{msg.text}</Text> : null}

        {msg.reaction ? (
          <View style={[s.reacao, saiu ? { left: 8 } : { right: 8 }, { backgroundColor: theme.waIn, borderColor: theme.border }]}>
            <Text style={s.reacaoTexto}>{msg.reaction}</Text>
          </View>
        ) : null}

        <View style={s.meta}>
          <Text style={[s.metaTexto, { color: corMeta }]} maxFontSizeMultiplier={1.3}>
            {autor ? `${autor} · ` : ""}{hhmm(msg.timestamp)}
          </Text>
          {saiu ? (
            <Text
              style={[
                s.metaTexto,
                { color: msg.readAt ? AZUL_LIDO : corMeta, fontWeight: msg.readAt ? "700" : "400", marginLeft: 3 },
              ]}
              maxFontSizeMultiplier={1.3}
            >
              {pendente ? "🕘" : msg.deliveredAt || msg.readAt ? "✓✓" : "✓"}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.waChat },
    centro: { alignItems: "center", justifyContent: "center" },

    acoesTopo: { flexDirection: "row", alignItems: "center", gap: 14 },
    tituloNav: { flexDirection: "row", alignItems: "center", gap: 9, maxWidth: 200 },
    tituloNavCorpo: { flexShrink: 1 },
    avatarPeq: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    avatarPeqTexto: { color: "#fff", fontWeight: "700", fontSize: 13.6 },
    nome: { ...TIPO.destaque, color: t.text },
    subLinha: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
    subtitulo: { ...TIPO.legenda, color: t.muted },
    assumirTexto: { ...TIPO.corpo, color: t.accent, fontWeight: "600" },

    origem: {
      flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "center",
      paddingHorizontal: 12, paddingVertical: 5, marginBottom: 8,
      backgroundColor: t.surface, borderRadius: 20,
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
    },
    origemTexto: { ...TIPO.legenda, color: t.muted, maxWidth: 240 },

    chat: { flex: 1, backgroundColor: t.waChat },
    chatConteudo: { paddingHorizontal: 10, paddingVertical: 10 },

    diaLinha: { alignItems: "center", marginVertical: 9 },
    diaTexto: {
      ...TIPO.legenda2, fontWeight: "600", color: t.waMuted, backgroundColor: t.surface,
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, overflow: "hidden",
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
    },

    balaoLinha: { flexDirection: "row", marginBottom: 4 },
    balaoComReacao: { marginBottom: 15 },
    balao: {
      maxWidth: "82%",
      paddingTop: 6, paddingHorizontal: 9, paddingBottom: 5,
      borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
      shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    balaoPendente: { opacity: 0.75 },
    // Reação pendurada na borda inferior do balão — posição do WhatsApp.
    reacao: {
      position: "absolute", bottom: -12, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 5, paddingVertical: 1,
      shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    },
    reacaoTexto: { fontSize: 12, lineHeight: 16 },
    arquivo: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 3, minWidth: 150 },
    arquivoTexto: { ...TIPO.subtitulo, flex: 1, fontWeight: "500" },
    textoBalao: { fontSize: 16, lineHeight: 21, letterSpacing: -0.3 },
    transcricao: { ...TIPO.nota, fontStyle: "italic", marginTop: 2 },
    imagem: { width: 220, height: 165, borderRadius: 6, marginBottom: 4 },
    meta: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginTop: 2 },
    metaTexto: { fontSize: 11, opacity: 0.7 },

    visor: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
    visorImagem: { width: "100%", height: "82%" },
    visorFechar: { position: "absolute", right: 18, zIndex: 2 },

    naoLidasLinha: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10 },
    naoLidasRisco: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.crit, opacity: 0.5 },
    naoLidasTexto: { ...TIPO.legenda2, fontWeight: "700", color: t.crit, letterSpacing: 0.6 },
    // Voltar ao fim: só aparece quando você já subiu bastante.
    descer: {
      position: "absolute", right: 14, bottom: 96, width: 38, height: 38, borderRadius: 19,
      alignItems: "center", justifyContent: "center", backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    },
    janelaFechada: {
      paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border,
    },
    janelaTexto: { ...TIPO.legenda, color: t.muted, textAlign: "center" },

    barra: {
      flexDirection: "row", alignItems: "flex-end", gap: 10,
      paddingHorizontal: 12, paddingTop: 9,
      backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border,
    },
    entrada: {
      flex: 1, minHeight: 38, maxHeight: 120,
      backgroundColor: t.bg, borderRadius: 19, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9,
      fontSize: 16, color: t.text,
    },
    // O símbolo de enviar já vem preenchido e circular: um fundo atrás dele seria
    // um círculo dentro de outro. O de gravar é vazado, então esse mantém o disco.
    enviar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    gravando: { backgroundColor: t.crit },
    off: { opacity: 0.35 },

    erroTexto: { ...TIPO.subtitulo, color: t.crit, textAlign: "center" },
    tentar: { ...TIPO.corpo, color: t.accent, fontWeight: "600" },
  });
