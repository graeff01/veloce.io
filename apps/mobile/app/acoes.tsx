import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSession } from "../src/ui/session";
import { buildTheme, STAGE } from "../src/ui/theme";
import { TIPO, CABECALHO_SECAO } from "../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../src/ui/forma";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import { ApiError } from "../src/core/errors";
import type { Conversation, Tag } from "../src/core/contracts";

// ── Folha de ações da conversa ────────────────────────────────────────────────
// Substitui a sequência de menus encadeados por UMA folha que mostra tudo de uma
// vez: etapa, etiquetas, dono e a IA. Menu que abre outro menu é padrão antigo —
// e obrigava a pessoa a lembrar onde estava.
//
// É uma folha NATIVA (detents do iOS): sobe até a metade, arrasta para expandir
// ou fechar, com a alça do sistema no topo.

export default function Acoes() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const { client, me } = useSession();
  const router = useRouter();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  const [conversa, setConversa] = useState<Conversation | null>(null);
  const [etiquetas, setEtiquetas] = useState<Tag[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!client || !contactId) return;
    try {
      const [c, ts] = await Promise.all([client.conversation(String(contactId)), client.tags().catch(() => [])]);
      setConversa(c);
      setEtiquetas(ts);
    } catch { /* a folha fecha sozinha se não houver o que mostrar */ }
  }, [client, contactId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const agir = useCallback(async (fn: () => Promise<unknown>, fecharDepois = false) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await fn();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (fecharDepois) router.back();
      else await carregar();
    } catch (e) {
      Alert.alert("Não deu", e instanceof ApiError ? e.message : "Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }, [ocupado, router, carregar]);

  if (!conversa) {
    return (
      <View style={[s.tela, s.centro]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const aplicadas = new Set(conversa.tags.map((t) => t.id));
  const etapaAtual = conversa.funnelStage;

  return (
    <View style={s.tela}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={s.conteudo} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(240).delay(20)}>
          <Text style={s.titulo} numberOfLines={1}>{conversa.contact.name}</Text>
          <Text style={s.subtitulo}>Ações da conversa</Text>
        </Animated.View>

        {/* IA */}
        <Animated.View entering={FadeInDown.duration(240).delay(60)}>
          <Pressable
            style={({ pressed }) => [s.destaque, pressed && s.pressionado]}
            onPress={() =>
              Alert.alert("A IA responde este lead?", "Ela vai redigir e ENVIAR a próxima resposta no WhatsApp.", [
                { text: "Cancelar", style: "cancel" },
                { text: "Pode responder", onPress: () => void agir(() => client!.aiReply(String(contactId)), true) },
              ])
            }
            disabled={ocupado}
          >
            <View style={[s.iconeDestaque, { backgroundColor: theme.accent }]}>
              <Simbolo nome={"sparkles" as never} tamanho={17} cor={theme.onAccent} />
            </View>
            <View style={s.destaqueCorpo}>
              <Text style={s.destaqueTitulo}>IA responde este lead</Text>
              <Text style={s.destaqueNota}>Redige e envia a próxima resposta</Text>
            </View>
            <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" />
          </Pressable>
        </Animated.View>

        {/* Etapa */}
        <Animated.View entering={FadeInDown.duration(240).delay(100)}>
          <Text style={s.secao}>Etapa do funil</Text>
          <View style={s.grade}>
            {Object.entries(STAGE).map(([chave, v]) => {
              const on = etapaAtual === chave;
              return (
                <Pressable
                  key={chave}
                  disabled={ocupado}
                  onPress={() => { void Haptics.selectionAsync().catch(() => {}); void agir(() => client!.setFunnelStage(String(contactId), chave)); }}
                  style={({ pressed }) => [
                    s.opcao,
                    { borderColor: on ? v.color : theme.border, backgroundColor: on ? v.color + "1F" : theme.surface },
                    pressed && s.pressionado,
                  ]}
                >
                  <Text style={[s.opcaoTexto, { color: on ? v.color : theme.text, fontWeight: on ? "700" : "500" }]}>
                    {v.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Etiquetas */}
        {etiquetas.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(240).delay(140)}>
            <Text style={s.secao}>Etiquetas</Text>
            <View style={s.grade}>
              {etiquetas.map((t) => {
                const on = aplicadas.has(t.id);
                return (
                  <Pressable
                    key={t.id}
                    disabled={ocupado}
                    onPress={() => {
                      void Haptics.selectionAsync().catch(() => {});
                      void agir(() => on
                        ? client!.removeTag(String(contactId), t.id)
                        : client!.addTag(String(contactId), t.id));
                    }}
                    style={({ pressed }) => [
                      s.opcao,
                      { borderColor: on ? t.color : theme.border, backgroundColor: on ? t.color + "1F" : theme.surface },
                      pressed && s.pressionado,
                    ]}
                  >
                    {on ? <Simbolo nome={"checkmark" as never} tamanho={11} cor={t.color} peso="bold" /> : null}
                    <Text style={[s.opcaoTexto, { color: on ? t.color : theme.text, fontWeight: on ? "700" : "500" }]}>
                      {t.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* Dono */}
        <Animated.View entering={FadeInDown.duration(240).delay(180)}>
          <Text style={s.secao}>Dono da conversa</Text>
          <View style={s.grupo}>
            {conversa.attendants.map((a, i) => {
              const on = conversa.assignedEmail === a.email;
              return (
                <View key={a.email}>
                  {i > 0 ? <View style={s.divisor} /> : null}
                  <Pressable
                    disabled={ocupado}
                    onPress={() => { void Haptics.selectionAsync().catch(() => {}); void agir(() => client!.assign(String(contactId), a.email)); }}
                    style={({ pressed }) => [s.linha, pressed && s.pressionado]}
                  >
                    <Text style={s.linhaTexto}>{a.name}{a.email === conversa.me ? " (você)" : ""}</Text>
                    {on ? <Simbolo nome={"checkmark" as never} tamanho={15} cor={theme.accent} peso="semibold" /> : null}
                  </Pressable>
                </View>
              );
            })}
            {conversa.assignedEmail ? (
              <>
                <View style={s.divisor} />
                <Pressable
                  disabled={ocupado}
                  onPress={() => void agir(() => client!.assign(String(contactId), null))}
                  style={({ pressed }) => [s.linha, pressed && s.pressionado]}
                >
                  <Text style={[s.linhaTexto, { color: theme.crit }]}>Remover dono</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Animated.View>

        <View style={{ height: ESP.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    centro: { alignItems: "center", justifyContent: "center" },
    conteudo: { paddingHorizontal: ESP.gutter, paddingTop: ESP.lg },

    titulo: { ...TIPO.titulo2, color: t.text },
    subtitulo: { ...TIPO.nota, color: t.muted, marginTop: 2, marginBottom: ESP.lg },
    secao: { ...CABECALHO_SECAO, color: t.muted, marginTop: ESP.lg, marginBottom: ESP.sm },

    destaque: {
      flexDirection: "row", alignItems: "center", gap: ESP.md,
      backgroundColor: t.surface, borderRadius: RAIO.medio, ...CURVA, padding: ESP.md,
    },
    iconeDestaque: { width: 34, height: 34, borderRadius: RAIO.peq, ...CURVA, alignItems: "center", justifyContent: "center" },
    destaqueCorpo: { flex: 1 },
    destaqueTitulo: { ...TIPO.corpo, fontWeight: "600", color: t.text },
    destaqueNota: { ...TIPO.nota, color: t.muted, marginTop: 1 },

    grade: { flexDirection: "row", flexWrap: "wrap", gap: ESP.sm },
    opcao: {
      flexDirection: "row", alignItems: "center", gap: 5,
      borderRadius: RAIO.pilula, borderWidth: 1,
      paddingHorizontal: 14, paddingVertical: 8,
    },
    opcaoTexto: { ...TIPO.nota },

    grupo: { backgroundColor: t.surface, borderRadius: RAIO.medio, ...CURVA, overflow: "hidden" },
    linha: { flexDirection: "row", alignItems: "center", paddingHorizontal: ESP.md, paddingVertical: 13 },
    linhaTexto: { ...TIPO.corpo, flex: 1, color: t.text },
    divisor: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: ESP.md },

    pressionado: { opacity: 0.6 },
  });
