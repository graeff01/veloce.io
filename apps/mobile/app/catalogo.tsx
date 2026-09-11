// ── Catálogo ─────────────────────────────────────────────────────────────────
// Consulta de preço SEM sair do atendimento. A JR tem 61 itens cadastrados e a
// vendedora precisava trocar de aplicativo para conferir um valor.
//
// Tocar num item monta a frase no rascunho da conversa: nome e preço, prontos
// para revisar antes de enviar. Não envia sozinho — quem decide o texto final é
// quem está atendendo.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSession } from "../src/ui/session";
import { useTema } from "../src/ui/tema";
import { TIPO } from "../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../src/ui/forma";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import { gravarRascunho, lerRascunho } from "../src/ui/respostas";
import { baixarImagemPublica, parteDeArquivo } from "../src/ui/media";
import { ApiError } from "../src/core/errors";
import type { ItemCatalogo } from "../src/core/contracts";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Catalogo() {
  const { client } = useSession();
  const router = useRouter();
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTema();
  const s = styles(theme);

  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let vivo = true;
    const id = setTimeout(() => {
      void client.catalogo(busca)
        .then((r) => { if (vivo) { setItens(r); setErro(null); } })
        .catch((e) => {
          if (!vivo) return;
          setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o catálogo.");
        })
        .finally(() => { if (vivo) setCarregando(false); });
    }, busca ? 300 : 0);
    return () => { vivo = false; clearTimeout(id); };
  }, [client, busca]);

  const [enviando, setEnviando] = useState<string | null>(null);

  const legenda = (item: ItemCatalogo) =>
    item.price != null ? `${item.title} — ${moeda(item.price)}` : item.title;

  /** Segurar = só o texto, para quem quer escrever em volta antes de mandar. */
  const inserirTexto = useCallback((item: ItemCatalogo) => {
    if (!contactId) return;
    void Haptics.selectionAsync().catch(() => {});
    const atual = lerRascunho(String(contactId));
    const frase = legenda(item);
    gravarRascunho(String(contactId), atual ? `${atual.trimEnd()} ${frase}` : frase);
    router.back();
  }, [contactId, router]);


  /**
   * Toque = manda o produto: FOTO com legenda. O lead vê a peça, não uma linha
   * de texto — que é o ponto de ter catálogo com imagem.
   *
   * Sem foto cadastrada, cai para o rascunho: melhor deixar a pessoa escrever
   * em volta do texto do que enviar um nome solto.
   */
  const enviarProduto = useCallback(async (item: ItemCatalogo) => {
    if (!contactId || !client) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (!item.imageUrl) {
      const atual = lerRascunho(String(contactId));
      const frase = legenda(item);
      gravarRascunho(String(contactId), atual ? `${atual.trimEnd()} ${frase}` : frase);
      router.back();
      return;
    }

    setEnviando(item.id);
    try {
      // Duas etapas com falhas MUITO diferentes: baixar a foto (rede pública) e
      // enviá-la (nosso servidor). Separadas para o erro dizer qual das duas.
      let local: string;
      try {
        local = await baixarImagemPublica(item.imageUrl, `catalogo-${item.id}`);
      } catch {
        Alert.alert(
          "Foto indisponível",
          "Não consegui baixar a imagem deste produto. O texto foi para a mensagem — revise e envie.",
        );
        inserirTexto(item);
        return;
      }
      const form = new FormData();
      form.append("file", await parteDeArquivo(local, "image/jpeg"), "produto.jpg");
      form.append("kind", "image");
      form.append("caption", legenda(item));
      await client.sendMedia(String(contactId), form);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Não enviou", e instanceof ApiError ? e.message : "Tente de novo.");
    } finally {
      setEnviando(null);
    }
  }, [client, contactId, router, inserirTexto]);


  return (
    <>
      <Stack.Screen
        options={{
          title: "Catálogo",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={s.acao}>Fechar</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
          style={s.tela}
          data={itens}
          keyExtractor={(i) => i.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: ESP.gutter, gap: ESP.sm, paddingBottom: insets.bottom + ESP.xxl }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <View>
            <View style={s.buscaCaixa}>
              <Simbolo nome={SIMBOLO.busca as never} tamanho={16} cor={theme.muted} />
              <TextInput
                style={s.buscaCampo}
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar produto"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
              <Text style={s.dica}>
                Toque para enviar a foto com o preço. Segure para inserir só o texto.
              </Text>
            </View>
          }
          ListEmptyComponent={
            carregando ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: ESP.xxl }} />
            ) : (
              <View style={s.vazioBox}>
                <Simbolo nome={"shippingbox" as never} tamanho={44} cor={theme.border} />
                <Text style={s.vazio}>
                  {erro ?? (busca
                    ? `Nada encontrado para “${busca}”.`
                    : "Nenhum produto cadastrado. O catálogo é mantido pela sua agência.")}
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(200).delay(Math.min(index, 8) * 22)}>
              <Pressable
                onPress={() => void enviarProduto(item)}
                onLongPress={() => inserirTexto(item)}
                delayLongPress={320}
                disabled={enviando !== null}
                style={({ pressed }) => [s.item, pressed && { backgroundColor: theme.raise }]}
                accessibilityRole="button"
                accessibilityLabel={`Enviar ${item.title}`}
                accessibilityHint="Segure para inserir só o texto na mensagem"
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={s.foto} resizeMode="cover" />
                ) : (
                  <View style={[s.foto, s.fotoVazia]}>
                    <Simbolo nome={"shippingbox.fill" as never} tamanho={20} cor={theme.muted} />
                  </View>
                )}
                <View style={s.corpo}>
                  <Text style={s.titulo} numberOfLines={2}>{item.title}</Text>
                  {item.price != null ? (
                    <Text style={s.preco}>{moeda(item.price)}</Text>
                  ) : (
                    <Text style={s.semPreco}>sem preço cadastrado</Text>
                  )}
                </View>
                {enviando === item.id
                  ? <ActivityIndicator size="small" color={theme.accent} />
                  : <Simbolo nome={SIMBOLO.enviar as never} tamanho={22} cor={theme.accent} />}
              </Pressable>
            </Animated.View>
          )}
        />
    </>
  );
}

const styles = (t: ReturnType<typeof useTema>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    acao: { color: t.accent, fontSize: 16, fontWeight: "600" },

    buscaCaixa: {
      flexDirection: "row", alignItems: "center", gap: ESP.sm,
      backgroundColor: t.raise, borderRadius: RAIO.peq, ...CURVA,
      paddingHorizontal: ESP.md, height: 38, marginBottom: ESP.sm,
    },
    buscaCampo: { ...TIPO.corpo, flex: 1, color: t.text, padding: 0 },
    dica: { ...TIPO.legenda, color: t.muted, paddingHorizontal: 2, paddingBottom: ESP.sm, lineHeight: 16 },

    item: {
      flexDirection: "row", alignItems: "center", gap: ESP.md,
      backgroundColor: t.surface, borderRadius: RAIO.medio, ...CURVA,
      padding: ESP.md,
    },
    foto: { width: 52, height: 52, borderRadius: RAIO.peq, ...CURVA, backgroundColor: t.raise },
    fotoVazia: { alignItems: "center", justifyContent: "center" },
    corpo: { flex: 1, gap: 2 },
    titulo: { ...TIPO.subtitulo, color: t.text, fontWeight: "600", lineHeight: 19 },
    preco: { ...TIPO.destaque, color: t.accent, fontWeight: "700" },
    semPreco: { ...TIPO.legenda, color: t.muted },

    vazioBox: { alignItems: "center", gap: ESP.md, paddingTop: ESP.xxl, paddingHorizontal: ESP.xl },
    vazio: { ...TIPO.subtitulo, color: t.muted, textAlign: "center", lineHeight: 20 },
  });
