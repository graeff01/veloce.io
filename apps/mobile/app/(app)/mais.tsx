import { ScrollView, StyleSheet, Text, useColorScheme, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  BookOpen, ChevronRight, Gauge, GraduationCap, Layers, MessageSquareWarning,
  Sparkles, Truck, User, Users,
} from "lucide-react-native";
import { useSession } from "../../src/ui/session";
import { buildTheme } from "../../src/ui/theme";
import type { PortalSection } from "../../src/core/contracts";

// ── Mais ──────────────────────────────────────────────────────────────────────
// Escape do produto: módulos adicionais que o TENANT tem, derivados de `sections`
// do /me. Nada de nome de cliente no código.
//
// Os que ainda não têm tela no app aparecem marcados como "em breve" em vez de
// virar link morto — assim a estrutura já cresce sem enganar o usuário.

const CATALOGO: { chave: PortalSection; rotulo: string; Icone: typeof Gauge; rota?: string }[] = [
  { chave: "painel", rotulo: "Painel", Icone: Gauge },
  { chave: "funil", rotulo: "Funil", Icone: Layers },
  { chave: "fechamento", rotulo: "Fechamento", Icone: Sparkles },
  { chave: "equipe", rotulo: "Equipe", Icone: Users },
  { chave: "ia", rotulo: "IA", Icone: Sparkles },
  { chave: "aprendizado", rotulo: "Aprendizado", Icone: GraduationCap },
  { chave: "objecoes", rotulo: "Objeções", Icone: MessageSquareWarning },
  { chave: "consumo", rotulo: "Consumo", Icone: BookOpen },
  { chave: "frete", rotulo: "Frete", Icone: Truck },
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
    <ScrollView style={s.tela} contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
      <View style={[s.cabecalho, { paddingTop: insets.top + 8 }]}>
        <Text style={s.titulo}>Mais</Text>
        {me?.brand.name ? <Text style={s.sub}>{me.brand.name}</Text> : null}
      </View>

      <Text style={s.secao}>Conta</Text>
      <Pressable style={s.item} onPress={() => router.push("/(app)/perfil")} accessibilityRole="button">
        <User size={19} color={theme.accent} strokeWidth={2.2} />
        <Text style={s.itemTexto}>{me?.user?.name ?? me?.user?.email ?? "Perfil"}</Text>
        <ChevronRight size={17} color={theme.muted} strokeWidth={2.2} />
      </Pressable>

      {modulos.length > 0 ? (
        <>
          <Text style={s.secao}>Ferramentas</Text>
          {modulos.map(({ chave, rotulo, Icone, rota }) => (
            <Pressable
              key={chave}
              disabled={!rota}
              onPress={() => rota && router.push(rota as never)}
              style={[s.item, !rota && s.itemInativo]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !rota }}
            >
              <Icone size={19} color={rota ? theme.accent : theme.muted} strokeWidth={2.2} />
              <Text style={[s.itemTexto, !rota && { color: theme.muted }]}>{rotulo}</Text>
              {rota
                ? <ChevronRight size={17} color={theme.muted} strokeWidth={2.2} />
                : <Text style={s.emBreve}>em breve</Text>}
            </Pressable>
          ))}
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
    cabecalho: {
      paddingHorizontal: 16, paddingBottom: 12, backgroundColor: t.surface,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    titulo: { fontSize: 32, fontWeight: "800", color: t.text, letterSpacing: -0.8 },
    sub: { fontSize: 13, color: t.muted, marginTop: 2 },
    secao: {
      fontSize: 11, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase",
      color: t.muted, marginTop: 22, marginBottom: 7, marginHorizontal: 16,
    },
    item: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      marginBottom: -StyleSheet.hairlineWidth,
    },
    itemInativo: { opacity: 0.65 },
    itemTexto: { flex: 1, fontSize: 16, color: t.text },
    emBreve: { fontSize: 11.5, fontWeight: "600", color: t.muted },
    nota: { fontSize: 12, color: t.muted, lineHeight: 17, margin: 16, marginTop: 12 },
  });
