import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS, ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from "react-native";
import { useEscuro } from "../../../src/ui/aparencia";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { SIMBOLO, Simbolo } from "../../../src/ui/simbolo";
import { AudioOpus, type ControleAudio, type EstadoAudio } from "../../../src/ui/audio-opus";
import { Papel } from "../../../src/ui/papel";
import { TIPO } from "../../../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../../../src/ui/forma";
import { useSession } from "../../../src/ui/session";
import { useFilaEnvio } from "../../../src/ui/fila-envio";
import { gravarRascunho, lerRascunho } from "../../../src/ui/respostas";
import { TextoRealcado } from "../../../src/ui/realce";
import { useTema } from "../../../src/ui/tema";
import { AZUL_LIDO, avatarColor, buildTheme, STAGE } from "../../../src/ui/theme";
import { midiaDaMensagem, midiaEmDataUri, parteDeArquivo } from "../../../src/ui/media";
import { useConversaAoVivo } from "../../../src/ui/stream";
import { ApiError } from "../../../src/core/errors";
import type { Conversation, Message, Tag } from "../../../src/core/contracts";
import { guardarConversa, lerConversa, lerLidas, marcarLida } from "../../../src/ui/cache";

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
  const { contactId, nome } = useLocalSearchParams<{ contactId: string; nome?: string }>();
  // A lista manda o nome junto — o cabeçalho não precisa esperar a rede.
  const nomeProvisorio = (nome ?? "").trim() || "Conversa";
  const { client, me } = useSession();
  const router = useRouter();
  const { width: larguraJanela } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useTema();
  const s = styles(theme);

  const [conversa, setConversa] = useState<Conversation | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Mostrando o que estava guardado no aparelho porque a rede não respondeu.
  const [semRede, setSemRede] = useState(false);
  // Rascunho por conversa: sair da tela não pode apagar o que foi escrito.
  const [texto, setTexto] = useState(() => (contactId ? lerRascunho(String(contactId)) : ""));
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  // Mensagens que JÁ apareceram na tela mas ainda não voltaram do servidor.
  const { daConversa: pendentesDaFila, enfileirar, enfileirarMidia } = useFilaEnvio();

  // Bolha otimista a partir da fila: some quando o servidor confirma e a
  // conversa recarrega, e SOBREVIVE a fechar o app.
  const pendentes = useMemo<Message[]>(() => pendentesDaFila(contactId).map((p) => ({
    id: p.id,
    text: p.texto, direction: "out", type: "text",
    timestamp: new Date(p.criadoEm).toISOString(),
    aiGenerated: false, sentByName: null,
    transcription: null, deliveredAt: null, readAt: null, reaction: null,
  })), [pendentesDaFila, contactId]);
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  const [longe, setLonge] = useState(false);   // rolado para cima
  const lista = useRef<FlatList<Item>>(null);
  // Dois conceitos diferentes, de propósito:
  //   · "lida" (servidor) = a EQUIPE já tratou esta conversa. É o que zera o
  //     contador para todo mundo.
  //   · "última visita" (local) = onde EU parei. Alimenta o divisor de novas
  //     mensagens, e é legitimamente por aparelho: o divisor da Maria não tem
  //     de sumir porque a Luiza abriu a conversa no aparelho dela.
  //
  // Lida ANTES de gravar a visita — senão o divisor nunca apareceria.
  const visitaAnterior = useRef<string | undefined>(
    contactId ? lerLidas()[String(contactId)] : undefined,
  );

  // Altura da barra de navegação + área segura de cima. É o quanto esta tela
  // começa abaixo da janela, e o que o KeyboardAvoidingView precisa descontar.
  const alturaCabecalho = insets.top + 44;

  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);


  // Persiste em repouso, não a cada tecla: gravar no disco a cada letra é
  // desperdício, e meio segundo de folga cobre a saída da tela.
  useEffect(() => {
    if (!contactId) return;
    const id = setTimeout(() => gravarRascunho(String(contactId), texto), 500);
    return () => clearTimeout(id);
  }, [contactId, texto]);

  // Volta da folha de respostas rápidas com o texto já montado lá.
  useFocusEffect(useCallback(() => {
    if (contactId) setTexto(lerRascunho(String(contactId)));
  }, [contactId]));

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
      const nova = await client.conversation(contactId);
      setConversa(nova);
      guardarConversa(String(contactId), nova);   // para abrir sem rede depois
      setSemRede(false);
      // A fila se esvazia sozinha: cada item sai dela quando o servidor
      // confirma. Não há mais estado local a zerar aqui.
      setErro(null);
    } catch (e) {
      // Erro do SERVIDOR (403, sessão expirada) é erro de verdade: some com o
      // cache, porque insistir mostraria conteúdo que a pessoa talvez não possa
      // mais ver. Falha de REDE é outra história — aí o cache é a resposta certa.
      if (e instanceof ApiError) {
        if (!e.requiresLogout) setErro(e.message);
      } else {
        const guardada = lerConversa(String(contactId));
        if (guardada) { setConversa(guardada); setSemRede(true); setErro(null); }
        else setErro("Não foi possível abrir a conversa.");
      }
    } finally {
      setCarregando(false);
    }
  }, [client, contactId]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Abrir a conversa é o que a marca como lida.
  // Abrir marca como lida para a EQUIPE, no servidor — não só neste aparelho.
  // Melhor esforço: falhar aqui não pode atrapalhar a leitura da conversa.
  useEffect(() => {
    if (!client || !contactId) return;
    // Para a equipe, no servidor. Melhor esforço: falhar aqui não pode
    // atrapalhar a leitura da conversa.
    void client.marcarEstado(String(contactId), { lida: true }).catch(() => {});
    // E para mim, neste aparelho, só para o divisor da próxima visita.
    marcarLida(String(contactId));
  }, [client, contactId]);
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

  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState("");

  /** Índices dos itens que casam — usados para pular de um ao outro. */
  const achados = useMemo(() => {
    const q = buscaTexto.trim().toLowerCase();
    if (!q) return [] as number[];
    return itens.reduce<number[]>((acc, it, i) => {
      if (it.tipo !== "msg") return acc;
      const texto = `${it.msg.text ?? ""} ${it.msg.transcription ?? ""}`.toLowerCase();
      if (texto.includes(q)) acc.push(i);
      return acc;
    }, []);
  }, [itens, buscaTexto]);

  const [achadoAtual, setAchadoAtual] = useState(0);
  useEffect(() => { setAchadoAtual(0); }, [buscaTexto]);

  const irParaAchado = useCallback((direcao: 1 | -1) => {
    if (achados.length === 0) return;
    const proximo = (achadoAtual + direcao + achados.length) % achados.length;
    setAchadoAtual(proximo);
    void Haptics.selectionAsync().catch(() => {});
    lista.current?.scrollToIndex({ index: achados[proximo]!, viewPosition: 0.5, animated: true });
  }, [achados, achadoAtual]);

  // ── Envio otimista ──────────────────────────────────────────────────────────
  // A mensagem entra na FILA, não numa tentativa única. Aparece na hora com
  // relógio e fica lá até o servidor confirmar — se a rede estiver fora, o
  // reenvio acontece sozinho quando ela voltar, mesmo que o app tenha sido
  // fechado no meio. Antes o texto voltava para o campo e dependia de a pessoa
  // lembrar de mandar de novo.
  const enviarTexto = useCallback(() => {
    const t = texto.trim();
    if (!contactId || !t) return;
    vibrar();
    setTexto("");
    gravarRascunho(contactId, "");
    enfileirar(contactId, t);
  }, [contactId, texto, enfileirar]);

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
    // Vai para a FILA, como o texto: rede ruim no meio do upload deixava a
    // foto pelo caminho, e foto é o que mais custa a tirar de novo.
    vibrar();
    enfileirarMidia(contactId, "imagem", {
      uri: asset.uri,
      nome: asset.fileName ?? "foto.jpg",
      tipo: asset.mimeType ?? "image/jpeg",
    });
  }, [client, contactId, enfileirarMidia]);

  const enviarDocumento = useCallback(async () => {
    if (!client || !contactId) return;
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }).catch(() => null);
    if (!r || r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];

    vibrar();
    enfileirarMidia(String(contactId), "documento", {
      uri: a.uri,
      nome: a.name || "documento",
      tipo: a.mimeType || "application/octet-stream",
    });
  }, [contactId, enfileirarMidia]);

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
      // HIGH_QUALITY no iOS grava .m4a (audio/mp4) — aceito pela Cloud API e o
      // mesmo contêiner que o Safari produzia no PWA.
      enfileirarMidia(String(contactId), "audio", { uri, nome: "audio.m4a", tipo: "audio/mp4" });
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





  // Uma folha com tudo à vista, em vez de menu que abre outro menu.
  const menu = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/acoes", params: { contactId: String(contactId) } });
  }, [router, contactId]);

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
    return (
      <View style={[s.tela, s.centro]}>
        <Stack.Screen options={{ title: nomeProvisorio }} />
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (erro || !conversa) {
    return (
      <View style={[s.tela, s.centro, { padding: 24, gap: 12 }]}>
        <Stack.Screen options={{ title: nomeProvisorio }} />
        <Text style={s.erroTexto}>{erro ?? "Conversa indisponível."}</Text>
        <Pressable onPress={() => void carregar()}><Text style={s.tentar}>Tentar de novo</Text></Pressable>
        <Pressable onPress={() => router.back()}><Text style={s.tentar}>Voltar</Text></Pressable>
      </View>
    );
  }

  const minha = !!conversa.assignedEmail && conversa.assignedEmail === conversa.me;
  // O bloco é centralizado na barra: para não encostar em nada, reserva-se o
  // MAIOR dos dois lados em ambos. Voltar ocupa ~44; a direita, ~44 sozinha e
  // ~112 quando o "Assumir" aparece.
  const reserva = Math.max(44, minha ? 44 : 112) + 10;
  const larguraTitulo = Math.max(130, larguraJanela - reserva * 2);
  const podeEnviar = conversa.windowOpen && !enviando;
  const etapa = conversa.funnelStage ? STAGE[conversa.funnelStage] : null;

  return (
    <KeyboardAvoidingView
      style={s.tela}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={alturaCabecalho}
    >
      <Papel cor={theme.dark ? "#cbd3da" : "#6b5f52"} opacidade={theme.dark ? 0.06 : 0.09} />
      {/* Header NATIVO: o botão voltar e o gesto de arrastar da borda vêm da
          pilha, não de um botão desenhado. É o que faz a tela parecer empurrada
          e não trocada. */}
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={[s.tituloNav, { width: larguraTitulo }]}>
              <View style={[s.avatarPeq, { backgroundColor: avatarColor(conversa.contact.name) }]}>
                <Text style={s.avatarPeqTexto} maxFontSizeMultiplier={1.2}>{conversa.contact.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={s.tituloNavCorpo}>
                <Text style={s.nome} numberOfLines={1}>{conversa.contact.name}</Text>
                <View style={s.subLinha}>
                  {etapa ? <Text style={[s.subtitulo, { color: etapa.color, fontWeight: "700" }]} numberOfLines={1}>{etapa.label}</Text> : null}
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
              <Pressable
                onPress={() => setBuscaAberta((v) => !v)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Buscar nesta conversa"
              >
                <Simbolo nome={SIMBOLO.busca as never} tamanho={20} cor={theme.accent} />
              </Pressable>
              <Pressable onPress={menu} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mais ações">
                <Simbolo nome={"ellipsis.circle" as never} tamanho={24} cor={theme.accent} />
              </Pressable>
            </View>
          ),
        }}
      />

      {/* Sem rede: a conversa na tela veio do aparelho. Dizer isso é o que
          separa "app offline" de "app quebrado" — e avisa que pode faltar
          mensagem recente. */}
      {semRede ? (
        <Animated.View style={s.semRede} entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)}>
          <Simbolo nome={"wifi.slash" as never} tamanho={13} cor={theme.warn} />
          <Text style={s.semRedeTexto} numberOfLines={1}>
            Sem conexão — mostrando a última versão salva
          </Text>
          <Pressable onPress={() => void carregar(true)} hitSlop={8} accessibilityRole="button">
            <Text style={s.semRedeAcao}>Atualizar</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {buscaAberta ? (
        <Animated.View style={s.buscaBarra} entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)}>
          <Simbolo nome={SIMBOLO.busca as never} tamanho={15} cor={theme.waMuted} />
          <TextInput
            style={s.buscaCampo}
            value={buscaTexto}
            onChangeText={setBuscaTexto}
            placeholder="Buscar nesta conversa"
            placeholderTextColor={theme.waMuted}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => irParaAchado(1)}
          />
          {buscaTexto.trim() ? (
            <>
              <Text style={s.buscaContagem}>
                {achados.length === 0 ? "0" : `${achadoAtual + 1}/${achados.length}`}
              </Text>
              <Pressable onPress={() => irParaAchado(-1)} hitSlop={8} accessibilityLabel="Anterior">
                <Simbolo nome={"chevron.up" as never} tamanho={15} cor={achados.length ? theme.accent : theme.border} />
              </Pressable>
              <Pressable onPress={() => irParaAchado(1)} hitSlop={8} accessibilityLabel="Próximo">
                <Simbolo nome={"chevron.down" as never} tamanho={15} cor={achados.length ? theme.accent : theme.border} />
              </Pressable>
            </>
          ) : null}
          <Pressable
            onPress={() => { setBuscaAberta(false); setBuscaTexto(""); }}
            hitSlop={8}
            accessibilityLabel="Fechar busca"
          >
            <Simbolo nome={SIMBOLO.fechar as never} tamanho={15} cor={theme.waMuted} />
          </Pressable>
        </Animated.View>
      ) : null}

      <FlatList
        ref={lista}
        data={itens}
        keyExtractor={(i) => i.id}
        style={s.chat}
        contentContainerStyle={s.chatConteudo}
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          conversa.lead || conversa.tags.length > 0 ? (
            <View style={s.faixaTopo}>
              {conversa.lead ? (
                <View style={s.origem}>
                  <Simbolo nome={SIMBOLO.anuncios as never} tamanho={12} cor={theme.accent} />
                  <Text style={s.origemTexto} numberOfLines={1}>
                    {conversa.lead.adModel || conversa.lead.adTitle || "Veio de anúncio"}
                  </Text>
                </View>
              ) : null}
              {conversa.tags.length > 0 ? (
                <View style={s.etiquetas}>
                  {conversa.tags.map((t) => (
                    <View key={t.id} style={[s.etiqueta, { backgroundColor: t.color }]}>
                      <Text style={s.etiquetaTexto} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t.name}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null
        }
        onScrollToIndexFailed={(info) => {
          // A lista ainda não mediu aquele item. Aproxima e tenta de novo.
          lista.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => {
            lista.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true });
          }, 120);
        }}
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
              termo={buscaAberta ? buscaTexto : ""}
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
        {/* Respostas rápidas e catálogo: os dois atalhos que evitam sair do app
            no meio do atendimento. */}
        <Pressable
          onPress={() => router.push({ pathname: "/respostas", params: { contactId } })}
          disabled={!podeEnviar}
          hitSlop={8}
          accessibilityLabel="Respostas rápidas"
        >
          <View style={!podeEnviar && s.off}><Simbolo nome={"text.bubble.fill" as never} tamanho={23} cor={theme.muted} /></View>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: "/catalogo", params: { contactId } })}
          disabled={!podeEnviar}
          hitSlop={8}
          accessibilityLabel="Catálogo"
        >
          <View style={!podeEnviar && s.off}><Simbolo nome={"tag.fill" as never} tamanho={22} cor={theme.muted} /></View>
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
// Nota de voz do WhatsApp vem em Ogg/Opus. No iOS o AVFoundation — motor do
// expo-audio — NÃO decodifica esse formato: o player carregava e ficava mudo.
// O WebKit decodifica, e é por isso que o portal web toca no mesmo iPhone.
//
// Então o motor é um WebView invisível (ver src/ui/audio-opus), o mesmo
// decodificador do portal. A interface segue nativa: o WebView não desenha nada.
function BolhaAudio({ uri, cor, corMeta, duracaoTexto }: {
  uri: string | null; cor: string; corMeta: string; duracaoTexto: string;
}) {
  const controle = useRef<ControleAudio>(null);
  const [estado, setEstado] = useState<EstadoAudio>({ tocando: false, posicao: 0, duracao: 0 });
  const [falhou, setFalhou] = useState(false);
  // O arquivo vira `data:` URI: o WKWebView não lê o cache de mídia por caminho.
  const [dados, setDados] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    let vivo = true;
    midiaEmDataUri(uri, "audio/ogg")
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
  }, [uri]);

  const alternar = useCallback(() => {
    if (!dados || falhou) return;
    vibrar();
    if (estado.tocando) controle.current?.pausar();
    else controle.current?.tocar();
  }, [dados, falhou, estado.tocando]);

  const progresso = estado.duracao > 0 ? Math.min(1, estado.posicao / estado.duracao) : 0;

  return (
    <Pressable
      onPress={alternar}
      disabled={!dados || falhou}
      accessibilityRole="button"
      accessibilityLabel={estado.tocando ? "Pausar áudio" : "Tocar áudio"}
      style={audioStyles.linha}
    >
      {dados ? (
        <AudioOpus ref={controle} dados={dados} onEstado={setEstado} onErro={() => setFalhou(true)} />
      ) : null}

      <View style={[audioStyles.botao, { borderColor: cor }]}>
        {!dados
          ? <ActivityIndicator size="small" color={cor} />
          : <Simbolo nome={(estado.tocando ? SIMBOLO.pausar : SIMBOLO.tocar) as never} tamanho={14} cor={cor} />}
      </View>
      <View style={audioStyles.trilhaWrap}>
        <View style={[audioStyles.trilha, { backgroundColor: corMeta }]}>
          <View style={[audioStyles.preenchida, { backgroundColor: cor, width: `${progresso * 100}%` }]} />
        </View>
        <Text style={[audioStyles.tempo, { color: corMeta }]}>
          {falhou ? "áudio indisponível"
            : estado.posicao > 0 ? mmss(estado.posicao)
            : estado.duracao > 0 ? mmss(estado.duracao)
            : duracaoTexto}
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

function Balao({ msg, pendente, theme, contactId, aoAbrirImagem, termo = "" }: {
  msg: Message;
  pendente: boolean;
  theme: ReturnType<typeof buildTheme>;
  contactId: string;
  aoAbrirImagem: (uri: string) => void;
  /** Trecho da busca, para marcar dentro da mensagem. */
  termo?: string;
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
            ? { backgroundColor: theme.accent, borderTopLeftRadius: 12, borderTopRightRadius: 3 }
            : { backgroundColor: theme.waIn, borderTopLeftRadius: 3, borderTopRightRadius: 12 },
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

        {msg.text && !ehArquivo ? (
          <TextoRealcado
            texto={msg.text}
            termo={termo}
            estilo={[s.textoBalao, { color: corTexto }]}
            estiloRealce={s.realce}
          />
        ) : null}

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
    tituloNav: { flexDirection: "row", alignItems: "center", gap: 9, justifyContent: "center" },
    tituloNavCorpo: { flexShrink: 1, minWidth: 0 },
    avatarPeq: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    avatarPeqTexto: { color: "#fff", fontWeight: "700", fontSize: 13.6 },
    nome: { ...TIPO.destaque, color: t.text },
    subLinha: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
    subtitulo: { ...TIPO.legenda, color: t.muted },
    assumirTexto: { ...TIPO.corpo, color: t.accent, fontWeight: "600" },

    origem: {
      flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "center",
      paddingHorizontal: 12, paddingVertical: 5, marginBottom: ESP.sm,
      backgroundColor: t.surface, borderRadius: RAIO.pilula,
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
    },
    origemTexto: { ...TIPO.legenda, color: t.muted, maxWidth: 240 },
    faixaTopo: { alignItems: "center", gap: 6, marginBottom: 4 },
    etiquetas: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 5, paddingHorizontal: 24 },
    etiqueta: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2.5, maxWidth: 150 },
    etiquetaTexto: { fontSize: 10.5, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },

    chat: { flex: 1, backgroundColor: "transparent" },
    chatConteudo: { paddingHorizontal: 10, paddingVertical: 10 },

    diaLinha: { alignItems: "center", marginVertical: 9 },
    diaTexto: {
      ...TIPO.legenda2, fontWeight: "600", color: t.waMuted, backgroundColor: t.surface,
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: RAIO.peq, overflow: "hidden",
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
    },

    balaoLinha: { flexDirection: "row", marginBottom: 4 },
    balaoComReacao: { marginBottom: 15 },
    balao: {
      maxWidth: "82%",
      paddingTop: 7, paddingHorizontal: 10, paddingBottom: 6,
      borderBottomLeftRadius: 12, borderBottomRightRadius: 12, ...CURVA,
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
    imagem: { width: 232, height: 174, borderRadius: RAIO.peq, ...CURVA, marginBottom: 4 },
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
      position: "absolute", right: ESP.gutter, bottom: 96, width: 40, height: 40, borderRadius: 20, ...CURVA,
      alignItems: "center", justifyContent: "center", backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    },
    buscaBarra: {
      flexDirection: "row", alignItems: "center", gap: ESP.sm,
      paddingHorizontal: ESP.gutter, paddingVertical: 8,
      backgroundColor: t.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    buscaCampo: { ...TIPO.subtitulo, flex: 1, color: t.text, padding: 0 },
    buscaContagem: { ...TIPO.legenda, color: t.waMuted, fontVariant: ["tabular-nums"] },

    // Fundo âmbar em vez de cor de texto: funciona nos dois lados da conversa,
    // sobre o balão claro e sobre o de destaque.
    realce: { backgroundColor: "#ffd54a", color: "#2b2100", fontWeight: "700" },

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
      backgroundColor: t.bg, borderRadius: 19, ...CURVA, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9,
      fontSize: 16, color: t.text,
    },
    // O símbolo de enviar já vem preenchido e circular: um fundo atrás dele seria
    // um círculo dentro de outro. O de gravar é vazado, então esse mantém o disco.
    enviar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    gravando: { backgroundColor: t.crit },
    off: { opacity: 0.35 },

    erroTexto: { ...TIPO.subtitulo, color: t.crit, textAlign: "center" },
    semRede: {
      flexDirection: "row", alignItems: "center", gap: ESP.sm,
      paddingHorizontal: ESP.gutter, paddingVertical: 7,
      backgroundColor: t.dark ? "rgba(245,181,68,0.14)" : "rgba(245,181,68,0.18)",
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    semRedeTexto: { ...TIPO.legenda, color: t.text, flex: 1 },
    semRedeAcao: { ...TIPO.legenda, color: t.accent, fontWeight: "700" },
    tentar: { ...TIPO.corpo, color: t.accent, fontWeight: "600" },
  });
