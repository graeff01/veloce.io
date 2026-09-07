// ── Respostas rápidas ─────────────────────────────────────────────────────────
// Folha aberta pelo compositor. Tocar numa resposta a insere na mensagem e
// fecha — o caminho tem de ser mais curto que digitar, senão ninguém usa.
//
// Editar é no mesmo lugar: uma lista que a vendedora molda ao próprio jeito de
// falar vale mais que uma lista perfeita escrita por nós.

import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTema } from "../src/ui/tema";
import { TIPO } from "../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../src/ui/forma";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import { gravarRascunho, gravarRespostas, lerRascunho, lerRespostas } from "../src/ui/respostas";

export default function Respostas() {
  const router = useRouter();
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTema();
  const s = styles(theme);

  const [lista, setLista] = useState<string[]>(() => lerRespostas());
  const [editando, setEditando] = useState(false);
  const [nova, setNova] = useState("");

  const usar = useCallback((texto: string) => {
    if (!contactId) return;
    void Haptics.selectionAsync().catch(() => {});
    // Acrescenta ao que já estava escrito, em vez de substituir: às vezes a
    // resposta pronta é o começo da frase, não a frase inteira.
    const atual = lerRascunho(String(contactId));
    gravarRascunho(String(contactId), atual ? `${atual.trimEnd()} ${texto}` : texto);
    router.back();
  }, [contactId, router]);

  const salvar = useCallback((proxima: string[]) => {
    setLista(proxima);
    gravarRespostas(proxima);
  }, []);

  const adicionar = useCallback(() => {
    const t = nova.trim();
    if (!t) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    salvar([...lista, t]);
    setNova("");
  }, [nova, lista, salvar]);

  const remover = useCallback((i: number) => {
    Alert.alert("Apagar resposta", lista[i] ?? "", [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: () => salvar(lista.filter((_, j) => j !== i)) },
    ]);
  }, [lista, salvar]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Respostas rápidas",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={s.acao}>Fechar</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => setEditando((v) => !v)} hitSlop={10} accessibilityRole="button">
              <Text style={s.acao}>{editando ? "Pronto" : "Editar"}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={s.tela}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: ESP.gutter, gap: ESP.sm, paddingBottom: insets.bottom + ESP.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {editando ? (
          <Animated.View style={s.novaLinha} entering={FadeInDown.duration(200)}>
            <TextInput
              style={s.novaCampo}
              value={nova}
              onChangeText={setNova}
              placeholder="Escrever uma resposta nova…"
              placeholderTextColor={theme.muted}
              multiline
              onSubmitEditing={adicionar}
            />
            <Pressable onPress={adicionar} disabled={!nova.trim()} hitSlop={8} accessibilityRole="button">
              <Simbolo
                nome={SIMBOLO.enviar as never}
                tamanho={26}
                cor={nova.trim() ? theme.accent : theme.border}
              />
            </Pressable>
          </Animated.View>
        ) : null}

        {lista.map((texto, i) => (
          <Animated.View key={`${i}-${texto.slice(0, 12)}`} layout={LinearTransition.duration(220)}>
            <Pressable
              onPress={() => (editando ? remover(i) : usar(texto))}
              style={({ pressed }) => [s.item, pressed && { backgroundColor: theme.raise }]}
              accessibilityRole="button"
              accessibilityLabel={editando ? `Apagar: ${texto}` : `Usar: ${texto}`}
            >
              <Text style={s.itemTexto}>{texto}</Text>
              {editando
                ? <Simbolo nome={SIMBOLO.fechar as never} tamanho={15} cor={theme.crit} />
                : <Simbolo nome={SIMBOLO.avancar as never} tamanho={13} cor={theme.muted} peso="semibold" />}
            </Pressable>
          </Animated.View>
        ))}

        {lista.length === 0 ? (
          <Text style={s.vazio}>
            Nenhuma resposta salva. Toque em Editar e escreva as frases que você mais repete.
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = (t: ReturnType<typeof useTema>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    acao: { color: t.accent, fontSize: 16, fontWeight: "600" },

    item: {
      flexDirection: "row", alignItems: "center", gap: ESP.md,
      backgroundColor: t.surface, borderRadius: RAIO.medio, ...CURVA,
      paddingHorizontal: ESP.gutter, paddingVertical: 13,
    },
    itemTexto: { ...TIPO.subtitulo, flex: 1, color: t.text, lineHeight: 20 },

    novaLinha: {
      flexDirection: "row", alignItems: "flex-end", gap: ESP.md,
      backgroundColor: t.surface, borderRadius: RAIO.medio, ...CURVA,
      paddingHorizontal: ESP.gutter, paddingVertical: 10, marginBottom: ESP.xs,
    },
    novaCampo: { ...TIPO.subtitulo, flex: 1, color: t.text, maxHeight: 100, padding: 0 },

    vazio: { ...TIPO.subtitulo, color: t.muted, textAlign: "center", paddingHorizontal: ESP.xl, marginTop: ESP.xl, lineHeight: 20 },
  });
