import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useSession } from "../../../src/ui/session";
import { STAGE_LABEL, buildTheme } from "../../../src/ui/theme";
import { midiaDaMensagem } from "../../../src/ui/media";
import { ApiError } from "../../../src/core/errors";
import type { Conversation, Message } from "../../../src/core/contracts";

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
  const lista = useRef<FlatList<Message>>(null);

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

  // Voltar do background reconcilia com o servidor. Sem polling contínuo — o push
  // é o que avisa de mensagem nova (e o iOS suspenderia o polling de qualquer forma).
  useFocusEffect(useCallback(() => { void carregar(true); }, [carregar]));

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
    // O endpoint existente espera multipart { file, kind }.
    form.append("file", {
      uri: asset.uri,
      name: asset.fileName ?? "foto.jpg",
      type: asset.mimeType ?? "image/jpeg",
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
      // HIGH_QUALITY no iOS grava em .m4a (audio/mp4) — formato que a Cloud API aceita
      // e o mesmo que o Safari produzia no PWA. Confirmar em aparelho antes da V1.
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
      <View style={[s.tela, s.centro, { padding: 24 }]}>
        <Text style={s.erroTexto}>{erro ?? "Conversa indisponível."}</Text>
        <Pressable onPress={() => void carregar()}><Text style={s.tentar}>Tentar de novo</Text></Pressable>
        <Pressable onPress={() => router.back()}><Text style={s.voltarTexto}>Voltar</Text></Pressable>
      </View>
    );
  }

  const minha = conversa.assignedEmail && conversa.assignedEmail === conversa.me;
  const podeEnviar = conversa.windowOpen && !enviando;

  return (
    <KeyboardAvoidingView
      style={s.tela}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[s.cabecalho, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Text style={s.voltar}>‹</Text>
        </Pressable>
        <View style={s.cabecalhoCorpo}>
          <Text style={s.nome} numberOfLines={1}>{conversa.contact.name}</Text>
          <Text style={s.subtitulo} numberOfLines={1}>
            {conversa.funnelStage ? (STAGE_LABEL[conversa.funnelStage] ?? conversa.funnelStage) : "—"}
            {conversa.assignedName ? ` · ${conversa.assignedName}` : ""}
          </Text>
        </View>
        {!minha && conversa.me ? (
          <Pressable style={s.assumir} onPress={() => void assumir()} accessibilityRole="button">
            <Text style={s.assumirTexto}>Assumir</Text>
          </Pressable>
        ) : null}
      </View>

      {conversa.lead ? (
        <View style={s.origem}>
          <Text style={s.origemTexto} numberOfLines={1}>
            📣 {conversa.lead.adModel || conversa.lead.adTitle || "Veio de anúncio"}
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={lista}
        data={conversa.items}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <Balao msg={item} theme={theme} contactId={String(contactId)} />
        )}
        contentContainerStyle={s.listaConteudo}
        onContentSizeChange={() => lista.current?.scrollToEnd({ animated: false })}
      />

      {!conversa.windowOpen ? (
        <View style={s.janelaFechada}>
          <Text style={s.janelaTexto}>
            Fora da janela de 24h do WhatsApp. Aguarde o lead escrever para responder.
          </Text>
        </View>
      ) : null}

      <View style={[s.barra, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={() => void enviarImagem(false)} disabled={!podeEnviar} hitSlop={8} accessibilityLabel="Galeria">
          <Text style={[s.icone, !podeEnviar && s.iconeOff]}>📎</Text>
        </Pressable>
        <Pressable onPress={() => void enviarImagem(true)} disabled={!podeEnviar} hitSlop={8} accessibilityLabel="Câmera">
          <Text style={[s.icone, !podeEnviar && s.iconeOff]}>📷</Text>
        </Pressable>
        <TextInput
          style={s.entrada}
          value={texto}
          onChangeText={setTexto}
          placeholder={conversa.windowOpen ? "Mensagem" : "Janela fechada"}
          placeholderTextColor={theme.muted}
          editable={podeEnviar}
          multiline
        />
        {texto.trim() ? (
          <Pressable onPress={() => void enviarTexto()} disabled={!podeEnviar} hitSlop={8} accessibilityLabel="Enviar">
            <Text style={[s.icone, !podeEnviar && s.iconeOff]}>➤</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => void alternarGravacao()} disabled={!podeEnviar} hitSlop={8} accessibilityLabel={gravando ? "Parar gravação" : "Gravar áudio"}>
            <Text style={[s.icone, gravando && { color: theme.danger }, !podeEnviar && s.iconeOff]}>
              {gravando ? "⏹" : "🎤"}
            </Text>
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

  return (
    <View style={[s.balao, saiu ? s.balaoSaiu : s.balaoEntrou]}>
      {msg.type === "image" && imagem ? (
        <Image source={{ uri: imagem }} style={s.imagem} resizeMode="cover" />
      ) : null}
      {msg.type === "audio" ? (
        <Text style={[s.rotuloMidia, saiu && s.textoSaiu]}>
          🎤 Áudio{msg.transcription ? "" : " (sem transcrição)"}
        </Text>
      ) : null}
      {msg.transcription ? (
        <Text style={[s.transcricao, saiu && s.textoSaiu]}>“{msg.transcription}”</Text>
      ) : null}
      {msg.text ? <Text style={[s.textoBalao, saiu && s.textoSaiu]}>{msg.text}</Text> : null}
      <View style={s.rodapeBalao}>
        {msg.aiGenerated ? <Text style={[s.marcaIa, saiu && s.textoSaiu]}>IA</Text> : null}
        {msg.sentByName ? <Text style={[s.autor, saiu && s.textoSaiu]}>{msg.sentByName}</Text> : null}
        <Text style={[s.hora, saiu && s.textoSaiu]}>
          {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
        {saiu ? <Text style={[s.hora, s.textoSaiu]}>{msg.readAt ? "✓✓" : msg.deliveredAt ? "✓" : "·"}</Text> : null}
      </View>
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    centro: { alignItems: "center", justifyContent: "center", gap: 12 },
    cabecalho: {
      flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingBottom: 10,
      backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    cabecalhoCorpo: { flex: 1 },
    voltar: { fontSize: 32, color: t.accent, lineHeight: 34, marginTop: -4 },
    voltarTexto: { color: t.accent, fontSize: 14, fontWeight: "600" },
    nome: { fontSize: 17, fontWeight: "700", color: t.text },
    subtitulo: { fontSize: 12, color: t.muted },
    assumir: { borderWidth: 1, borderColor: t.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
    assumirTexto: { color: t.accent, fontSize: 12.5, fontWeight: "700" },
    origem: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border },
    origemTexto: { fontSize: 12, color: t.muted },
    listaConteudo: { padding: 12, gap: 8 },
    balao: { maxWidth: "82%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
    balaoEntrou: { alignSelf: "flex-start", backgroundColor: t.bubbleIn, borderWidth: 1, borderColor: t.border },
    balaoSaiu: { alignSelf: "flex-end", backgroundColor: t.bubbleOut },
    textoBalao: { fontSize: 15.5, color: t.text, lineHeight: 21 },
    textoSaiu: { color: t.accentText },
    transcricao: { fontSize: 14, fontStyle: "italic", color: t.muted },
    rotuloMidia: { fontSize: 14, color: t.text },
    imagem: { width: 220, height: 165, borderRadius: 10 },
    rodapeBalao: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end" },
    hora: { fontSize: 10.5, color: t.muted },
    autor: { fontSize: 10.5, color: t.muted, fontWeight: "600" },
    marcaIa: { fontSize: 9.5, color: t.muted, fontWeight: "800" },
    janelaFechada: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border },
    janelaTexto: { fontSize: 12, color: t.muted, textAlign: "center" },
    barra: {
      flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 10,
      backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border,
    },
    entrada: {
      flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: t.bg, borderRadius: 20, borderWidth: 1,
      borderColor: t.border, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15.5, color: t.text,
    },
    icone: { fontSize: 22, color: t.accent },
    iconeOff: { opacity: 0.3 },
    erroTexto: { color: t.danger, fontSize: 14, textAlign: "center" },
    tentar: { color: t.accent, fontSize: 14, fontWeight: "700" },
  });
