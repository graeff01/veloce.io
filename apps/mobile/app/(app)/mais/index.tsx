import { ScrollView, StyleSheet, Text, useColorScheme, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { SIMBOLO, Simbolo } from "../../../src/ui/simbolo";
import { CABECALHO_SECAO, TIPO } from "../../../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../../../src/ui/forma";
import { useSession } from "../../../src/ui/session";
import { buildTheme } from "../../../src/ui/theme";
import type { PortalSection } from "../../../src/core/contracts";

// ── Mais ──────────────────────────────────────────────────────────────────────
// Escape do produto: módulos adicionais que o TENANT tem, derivados de `sections`
// do /me. Nada de nome de cliente no código.
//
// Os que ainda não têm tela no app aparecem marcados como "em breve" em vez de
// virar link morto — assim a estrutura já cresce sem enganar o usuário.

// Símbolo do sistema por ferramenta — o mesmo vocabulário visual dos Ajustes.
const CATALOGO: { chave: PortalSection; rotulo: string; simbolo: string; rota?: string }[] = [
  { chave: "painel", rotulo: "Painel", simbolo: "chart.bar.fill" },
  { chave: "funil", rotulo: "Funil", simbolo: "line.3.horizontal.decrease" },
  { chave: "fechamento", rotulo: "Fechamento", simbolo: "flame.fill" },
  { chave: "equipe", rotulo: "Equipe", simbolo: "person.2.fill" },
  { chave: "ia", rotulo: "IA", simbolo: "sparkles" },
  { chave: "aprendizado", rotulo: "Aprendizado", simbolo: "graduationcap.fill" },
  { chave: "objecoes", rotulo: "Objeções", simbolo: "exclamationmark.bubble.fill" },
  { chave: "consumo", rotulo: "Consumo", simbolo: "gauge.medium" },
  { chave: "frete", rotulo: "Frete", simbolo: "shippingbox.fill" },
];

export default function Mais() {
  const { me, can } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(me?.brand ?? null, useColorScheme() === "dark");
  const s = styles(theme);

  // Conversas, Anúncios e Orçamentos já são módulos da barra — não repetem aqui.
  const modulos = CATALOGO.filter((m) => can(m.chave));

  return (
    <ScrollView style={s.tela} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
      <Stack.Screen options={{ title: "Mais", headerLargeTitle: true }} />
      {me?.brand.name ? <Text style={s.sub}>{me.brand.name}</Text> : null}

      <Text style={s.secao}>Conta</Text>
      <View style={s.grupo}>
        <Pressable style={s.item} onPress={() => router.push("/perfil")} accessibilityRole="button">
          <View style={[s.icone, { backgroundColor: theme.accent }]}>
            <Simbolo nome={SIMBOLO.pessoa as never} tamanho={17} cor="#fff" />
          </View>
          <Text style={s.itemTexto}>{me?.user?.name ?? me?.user?.email ?? "Perfil"}</Text>
          <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" />
        </Pressable>
      </View>

      {modulos.length > 0 ? (
        <>
          <Text style={s.secao}>Ferramentas</Text>
          <View style={s.grupo}>
            {modulos.map(({ chave, rotulo, simbolo, rota }, i) => (
              <View key={chave}>
                {i > 0 ? <View style={s.divisor} /> : null}
                <Pressable
                  disabled={!rota}
                  onPress={() => rota && router.push(rota as never)}
                  style={[s.item, !rota && s.itemInativo]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !rota }}
                >
                  <View style={[s.icone, { backgroundColor: rota ? theme.accent : theme.muted }]}>
                    <Simbolo nome={simbolo as never} tamanho={16} cor="#fff" />
                  </View>
                  <Text style={[s.itemTexto, !rota && { color: theme.muted }]}>{rotulo}</Text>
                  {rota
                    ? <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" />
                    : <Text style={s.emBreve}>em breve</Text>}
                </Pressable>
              </View>
            ))}
          </View>
          <Text style={s.nota}>
            As ferramentas disponíveis são definidas pela sua agência. As marcadas como
            &quot;em breve&quot; já existem no painel web e chegarão ao aplicativo.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    sub: { ...TIPO.nota, color: t.muted, marginHorizontal: 16, marginTop: 2 },
    secao: {
      ...CABECALHO_SECAO, color: t.muted,
      marginTop: 26, marginBottom: 7, marginHorizontal: 32,
    },
    // Lista AGRUPADA com recuo, como nos Ajustes: cartão arredondado sobre o
    // fundo, não linhas de ponta a ponta. É o que separa "tela de app" de
    // "lista de página web".
    grupo: {
      marginHorizontal: ESP.gutter, borderRadius: RAIO.medio, ...CURVA, overflow: "hidden", backgroundColor: t.surface,
    },
    item: { flexDirection: "row", alignItems: "center", gap: ESP.md, paddingHorizontal: ESP.gutter, paddingVertical: 12 },
    itemInativo: { opacity: 0.55 },
    // Ícone em quadradinho colorido — vocabulário dos Ajustes do iOS.
    icone: { width: 29, height: 29, borderRadius: 7, ...CURVA, alignItems: "center", justifyContent: "center" },
    itemTexto: { ...TIPO.corpo, flex: 1, color: t.text },
    emBreve: { ...TIPO.nota, color: t.muted },
    divisor: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 55 },
    nota: { ...TIPO.nota, color: t.muted, marginHorizontal: 32, marginTop: 10 },
  });
