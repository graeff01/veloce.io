// ── Filtro por campanha ───────────────────────────────────────────────────────
// Antes era uma fileira de pílulas rolando na horizontal, sob os filtros. Com
// cinco campanhas ou mais, as últimas ficavam fora da tela — o usuário só
// descobre que existem se arrastar, e nada indicava isso. Vira uma folha: a
// lista inteira de uma vez, com quantos leads cada campanha trouxe.

import { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEscuro } from "../src/ui/aparencia";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSession } from "../src/ui/session";
import { useTema } from "../src/ui/tema";
import { buildTheme } from "../src/ui/theme";
import { TIPO } from "../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../src/ui/forma";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import { lerCampanhas } from "../src/ui/campanhas-store";

export default function Campanhas() {
  const { me } = useSession();
  const router = useRouter();
  const { atual } = useLocalSearchParams<{ atual?: string }>();
  const theme = useTema();
  const s = styles(theme);

  const campanhas = lerCampanhas();
  const selecionada = atual && atual.length > 0 ? atual : null;
  const total = campanhas.reduce((n, c) => n + c.total, 0);

  // Volta para a caixa de entrada COM o filtro aplicado. String vazia = "todas".
  const escolher = useCallback((nome: string | null) => {
    void Haptics.selectionAsync().catch(() => {});
    router.dismissTo({ pathname: "/(app)/conversas", params: { campanha: nome ?? "" } });
  }, [router]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Campanha",
          // A folha cresce com o conteúdo: com duas linhas, meia tela em branco
          // parecia coisa quebrada. Muitas campanhas continuam rolando.
          headerStyle: { backgroundColor: theme.surface },
          headerTitleStyle: { color: theme.text, fontSize: 16 },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={s.acao}>Fechar</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={s.tela} contentContainerStyle={s.conteudo} contentInsetAdjustmentBehavior="automatic">
        <View style={s.grupo}>
          <Linha
            rotulo="Todas as campanhas"
            contagem={total}
            marcada={selecionada === null}
            onPress={() => escolher(null)}
            theme={theme}
          />
          {campanhas.map((c) => (
            <Linha
              key={c.nome}
              rotulo={c.nome}
              contagem={c.total}
              marcada={selecionada === c.nome}
              onPress={() => escolher(c.nome)}
              theme={theme}
            />
          ))}
        </View>
        {campanhas.length === 0 ? (
          <Text style={s.vazio}>Nenhum lead veio de campanha nesta lista.</Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Linha({ rotulo, contagem, marcada, onPress, theme }: {
  rotulo: string; contagem: number; marcada: boolean; onPress: () => void;
  theme: ReturnType<typeof buildTheme>;
}) {
  const s = styles(theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: marcada }}
      style={({ pressed }) => [s.linha, pressed && { backgroundColor: theme.raise }]}
    >
      <Text style={[s.linhaTexto, marcada && { fontWeight: "700", color: theme.accent }]} numberOfLines={2}>
        {rotulo}
      </Text>
      <Text style={s.contagem} maxFontSizeMultiplier={1.2}>{contagem}</Text>
      {marcada ? <Simbolo nome={"checkmark" as never} tamanho={17} cor={theme.accent} /> : <View style={s.espaco} />}
    </Pressable>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    conteudo: { padding: ESP.gutter, gap: ESP.md },
    grupo: { backgroundColor: t.surface, borderRadius: RAIO.medio, ...CURVA, overflow: "hidden" },
    linha: { flexDirection: "row", alignItems: "center", gap: ESP.md, paddingHorizontal: ESP.gutter, paddingVertical: 13 },
    linhaTexto: { ...TIPO.corpo, flex: 1, color: t.text },
    contagem: { ...TIPO.subtitulo, color: t.muted, fontVariant: ["tabular-nums"] },
    espaco: { width: 17 },
    vazio: { ...TIPO.subtitulo, color: t.muted, textAlign: "center", paddingHorizontal: ESP.xxl },
    acao: { color: t.accent, fontSize: 16, fontWeight: "600" },
  });
