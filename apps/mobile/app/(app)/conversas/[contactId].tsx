import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { ArrowLeft, Camera, Megaphone, Mic, Paperclip, Send, Square, UserRound } from "lucide-react-native";
import { useSession } from "../../../src/ui/session";
import { AZUL_LIDO, avatarColor, buildTheme, STAGE } from "../../../src/ui/theme";
import { midiaDaMensagem } from "../../../src/ui/media";
import { ApiError } from "../../../src/core/errors";
import type { Conversation, Message } from "../../../src/core/contracts";

// ── Thread ────────────────────────────────────────────────────────────────────
// Visual portado do portal: fundo do chat na cor do WhatsApp (--wa-chat), balão
// recebido branco com o canto superior-ESQUERDO reto, balão enviado na cor da
// marca com o canto superior-DIREITO reto, raio 8, texto 13.5. Hora e ticks no
// rodapé do balão; tick de lido em azul.

type Item = { tipo: "dia"; id: string; rotulo: string } | { tipo: "msg"; id: string; msg: Message };

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
  const lista = useRef<FlatList<Item>>(null);

  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const carregar = useCallback(async (silencioso = false) => {
    if (!client || !contactId) return;
    if (!silencioso) setCarregando(true);
    try {
      setConversa(await client.conversation(contactId));
      setErro(null);
    } catch (e) {
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível abrir a conversa.");
    } finally {
      setCarregando(false);
    }
  }, [client, contactId]);

  useEffect(() => { void carregar(); }, [carregar]);
  useFocusEffect(useCallback(() => { void carregar(true); }, [carregar]));

  // Agrupa por dia, como o portal.
  const itens = useMemo<Item[]>(() => {
    if (!conversa) return [];
    const out: Item[] = [];
    let diaAtual = "";
    for (const m of conversa.items) {
      const dia = new Date(m.timestamp).toDateString();
      if (dia !== diaAtual) {
        diaAtual = dia;
        out.push({ tipo: "dia", id: `dia-${dia}`, rotulo: rotuloDoDia(m.timestamp) });
      }
      out.push({ tipo: "msg", id: m.id, msg: m });
    }
    return out;
  }, [conversa]);

  const enviarTexto = useCallback(async () => {
    const t = texto.trim();
    if (!client || !contactId || !t || enviando) return;
    setEnviando(true);
    setTexto("");
    try {
      await client.sendText(contactId, t);
      await carregar(true);
    } catch (e) {
      setTexto(t); // devolve o que a pessoa escreveu — nada se perde
      Alert.alert("Não enviou", e instanceof ApiError ? e.message : "Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }, [client, contactId, texto, enviando, carregar]);

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

  const alternarGravacao = useCallback(async () => {
    if (!client || !contactId) return;
    if (gravando) {
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
    setGravando(true);
  }, [client, contactId, gravando, gravador, carregar]);

  const assumir = useCallback(async () => {
    if (!client || !contactId || !conversa?.me) return;
    try {
      await client.assign(contactId, conversa.me);
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
      {/* Cabeçalho */}
      <View style={[s.cabecalho, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={23} color={theme.accent} strokeWidth={2.2} />
        </Pressable>

        <View style={[s.avatarPeq, { backgroundColor: avatarColor(conversa.contact.name) }]}>
          <Text style={s.avatarPeqTexto}>{conversa.contact.name.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={s.cabecalhoCorpo}>
          <Text style={s.nome} numberOfLines={1}>{conversa.contact.name}</Text>
          <View style={s.subLinha}>
            {etapa ? <Text style={[s.subtitulo, { color: etapa.color, fontWeight: "700" }]}>{etapa.label}</Text> : null}
            {conversa.assignedName ? (
              <>
                <Text style={s.subtitulo}>·</Text>
                <UserRound size={10} color={theme.muted} strokeWidth={2.4} />
                <Text style={s.subtitulo} numberOfLines={1}>{conversa.assignedName}</Text>
              </>
            ) : null}
          </View>
        </View>

        {!minha && conversa.me ? (
          <Pressable style={s.assumir} onPress={() => void assumir()} accessibilityRole="button">
            <Text style={s.assumirTexto}>Assumir</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Origem do anúncio */}
      {conversa.lead ? (
        <View style={s.origem}>
          <Megaphone size={11} color={theme.accent} strokeWidth={2.4} />
          <Text style={s.origemTexto} numberOfLines={1}>
            {conversa.lead.adModel || conversa.lead.adTitle || "Veio de anúncio"}
          </Text>
        </View>
      ) : null}

      {/* Mensagens */}
      <FlatList
        ref={lista}
        data={itens}
        keyExtractor={(i) => i.id}
        style={s.chat}
        contentContainerStyle={s.chatConteudo}
        renderItem={({ item }) =>
          item.tipo === "dia" ? (
            <View style={s.diaLinha}>
              <Text style={s.diaTexto}>{item.rotulo}</Text>
            </View>
          ) : (
            <Balao msg={item.msg} theme={theme} contactId={String(contactId)} />
          )
        }
        onContentSizeChange={() => lista.current?.scrollToEnd({ animated: false })}
      />

      {!conversa.windowOpen ? (
        <View style={s.janelaFechada}>
          <Text style={s.janelaTexto}>
            Fora da janela de 24h do WhatsApp. Aguarde o lead escrever para responder.
          </Text>
        </View>
      ) : null}

      {/* Compositor */}
      <View style={[s.barra, { paddingBottom: insets.bottom + 9 }]}>
        <Pressable onPress={() => void enviarImagem(false)} disabled={!podeEnviar} hitSlop={8} accessibilityLabel="Anexar da galeria">
          <Paperclip size={22} color={theme.muted} strokeWidth={2} style={!podeEnviar && s.off} />
        </Pressable>
        <Pressable onPress={() => void enviarImagem(true)} disabled={!podeEnviar} hitSlop={8} accessibilityLabel="Câmera">
          <Camera size={22} color={theme.muted} strokeWidth={2} style={!podeEnviar && s.off} />
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
            style={[s.enviar, { backgroundColor: theme.accent }, !podeEnviar && s.off]}
            accessibilityLabel="Enviar"
          >
            <Send size={18} color={theme.onAccent} strokeWidth={2.4} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void alternarGravacao()}
            disabled={!podeEnviar}
            style={[s.enviar, { backgroundColor: gravando ? theme.crit : theme.accent }, !podeEnviar && s.off]}
            accessibilityLabel={gravando ? "Parar gravação" : "Gravar áudio"}
          >
            {gravando
              ? <Square size={16} color="#fff" strokeWidth={2.6} fill="#fff" />
              : <Mic size={18} color={theme.onAccent} strokeWidth={2.4} />}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Balao({ msg, theme, contactId }: { msg: Message; theme: ReturnType<typeof buildTheme>; contactId: string }) {
  const { client } = useSession();
  const [imagem, setImagem] = useState<string | null>(null);
  const s = styles(theme);
  const saiu = msg.direction === "out";

  useEffect(() => {
    if (msg.type !== "image" || !client) return;
    let vivo = true;
    void midiaDaMensagem(client, contactId, msg.id, "image")
      .then((uri) => { if (vivo) setImagem(uri); })
      .catch(() => { /* miniatura falhou: o rótulo abaixo continua legível */ });
    return () => { vivo = false; };
  }, [client, contactId, msg.id, msg.type]);

  const corTexto = saiu ? theme.onAccent : theme.waText;
  const corMeta = saiu ? theme.onAccent : theme.waMuted;
  const autor = saiu ? (msg.aiGenerated ? "IA" : msg.sentByName || "Equipe") : null;

  return (
    <View style={[s.balaoLinha, { justifyContent: saiu ? "flex-end" : "flex-start" }]}>
      <View
        style={[
          s.balao,
          saiu
            ? { backgroundColor: theme.accent, borderTopLeftRadius: 8, borderTopRightRadius: 0 }
            : { backgroundColor: theme.waIn, borderTopLeftRadius: 0, borderTopRightRadius: 8 },
        ]}
      >
        {msg.type === "image" && imagem ? (
          <Image source={{ uri: imagem }} style={s.imagem} resizeMode="cover" />
        ) : null}

        {msg.type === "audio" ? (
          <Text style={[s.rotuloMidia, { color: corTexto }]}>🎤 Áudio</Text>
        ) : null}

        {msg.transcription ? (
          <Text style={[s.transcricao, { color: corMeta }]}>“{msg.transcription}”</Text>
        ) : null}

        {msg.text ? <Text style={[s.textoBalao, { color: corTexto }]}>{msg.text}</Text> : null}

        <View style={s.meta}>
          <Text style={[s.metaTexto, { color: corMeta }]}>
            {autor ? `${autor} · ` : ""}{hhmm(msg.timestamp)}
          </Text>
          {saiu ? (
            <Text
              style={[
                s.metaTexto,
                { color: msg.readAt ? AZUL_LIDO : corMeta, fontWeight: msg.readAt ? "700" : "400", marginLeft: 3 },
              ]}
            >
              {msg.deliveredAt || msg.readAt ? "✓✓" : "✓"}
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

    cabecalho: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 12, paddingBottom: 9,
      backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    avatarPeq: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    avatarPeqTexto: { color: "#fff", fontWeight: "700", fontSize: 13.6 },
    cabecalhoCorpo: { flex: 1 },
    nome: { fontSize: 16, fontWeight: "700", color: t.text },
    subLinha: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
    subtitulo: { fontSize: 11.5, color: t.muted },
    assumir: { borderWidth: 1, borderColor: t.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
    assumirTexto: { color: t.accent, fontSize: 12.5, fontWeight: "700" },

    origem: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 16, paddingVertical: 6,
      backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    origemTexto: { fontSize: 11.5, color: t.muted, flex: 1 },

    chat: { flex: 1, backgroundColor: t.waChat },
    chatConteudo: { paddingHorizontal: 10, paddingVertical: 10 },

    diaLinha: { alignItems: "center", marginVertical: 9 },
    diaTexto: {
      fontSize: 11, fontWeight: "600", color: t.waMuted, backgroundColor: t.surface,
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, overflow: "hidden",
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
    },

    balaoLinha: { flexDirection: "row", marginBottom: 4 },
    balao: {
      maxWidth: "82%",
      paddingTop: 6, paddingHorizontal: 9, paddingBottom: 5,
      borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
      shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    textoBalao: { fontSize: 13.5, lineHeight: 19 },
    rotuloMidia: { fontSize: 13.5 },
    transcricao: { fontSize: 12.5, fontStyle: "italic", marginTop: 2 },
    imagem: { width: 220, height: 165, borderRadius: 6, marginBottom: 4 },
    meta: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginTop: 2 },
    metaTexto: { fontSize: 10, opacity: 0.65 },

    janelaFechada: {
      paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border,
    },
    janelaTexto: { fontSize: 11.5, color: t.muted, textAlign: "center" },

    barra: {
      flexDirection: "row", alignItems: "flex-end", gap: 10,
      paddingHorizontal: 12, paddingTop: 9,
      backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border,
    },
    entrada: {
      flex: 1, minHeight: 38, maxHeight: 120,
      backgroundColor: t.bg, borderRadius: 19, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9,
      fontSize: 14.5, color: t.text,
    },
    enviar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    off: { opacity: 0.35 },

    erroTexto: { color: t.crit, fontSize: 14, textAlign: "center" },
    tentar: { color: t.accent, fontSize: 14, fontWeight: "700" },
  });
