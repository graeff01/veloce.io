import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { CABECALHO_SECAO, TIPO } from "../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../src/ui/forma";
import { useSession } from "../src/ui/session";
import { useTema } from "../src/ui/tema";
import { buildTheme } from "../src/ui/theme";
import { ApiError } from "../src/core/errors";
import type { Equipe as DadosEquipe, LinhaEquipe } from "../src/core/contracts";

// ── Equipe ────────────────────────────────────────────────────────────────────
// Três vendedoras no mesmo número: sem esta tela ninguém sabe quem respondeu o
// quê. O SERVIDOR já decide o que cada papel enxerga — atendente recebe só a
// própria linha, admin recebe o time inteiro. O app não reimplementa a regra:
// desenha o que veio.

const PERIODOS: { valor: string; rotulo: string }[] = [
  { valor: "week", rotulo: "Semana" },
  { valor: "month", rotulo: "Mês" },
  { valor: "quarter", rotulo: "Trimestre" },
];

/** "1min", "2h" — tempo de primeira resposta, do jeito que se fala. */
function tempo(seg: number | null): string {
  if (seg == null) return "—";
  if (seg < 60) return `${Math.round(seg)}s`;
  if (seg < 3600) return `${Math.round(seg / 60)}min`;
  return `${(seg / 3600).toFixed(1).replace(".", ",")}h`;
}

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function Equipe() {
  const { client } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTema();
  const s = styles(theme);

  const [periodo, setPeriodo] = useState("month");
  const [dados, setDados] = useState<DadosEquipe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!client) return;
    setCarregando(true);
    try {
      setDados(await client.equipe(periodo));
      setErro(null);
    } catch (e) {
      if (e instanceof ApiError && !e.requiresLogout) setErro(e.message);
      else if (!(e instanceof ApiError)) setErro("Não foi possível carregar os números da equipe.");
    } finally {
      setCarregando(false);
    }
  }, [client, periodo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const trocar = (v: string) => {
    void Haptics.selectionAsync().catch(() => {});
    setPeriodo(v);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Equipe",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar">
              <Text style={s.fechar}>Fechar</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={s.tela}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: insets.bottom + ESP.xxl }}
      >
        <View style={s.periodos}>
          {PERIODOS.map((p) => {
            const ativo = p.valor === periodo;
            return (
              <Pressable
                key={p.valor}
                style={[s.periodo, ativo && { backgroundColor: theme.accent }]}
                onPress={() => trocar(p.valor)}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={`Ver o período: ${p.rotulo}`}
              >
                <Text style={[s.periodoTexto, ativo && { color: theme.onAccent, fontWeight: "700" }]}>{p.rotulo}</Text>
              </Pressable>
            );
          })}
        </View>

        {erro ? <Text style={s.erro}>{erro}</Text> : null}
        {carregando && !dados ? <ActivityIndicator color={theme.accent} style={{ marginTop: ESP.xl }} /> : null}

        {dados?.team ? (
          <>
            <Text style={s.secao}>O time em {dados.periodLabel || "período"}</Text>
            <View style={s.grade}>
              <Ficha t={theme} rotulo="Leads novos" valor={String(dados.team.newLeads)} />
              <Ficha t={theme} rotulo="Vendas" valor={String(dados.team.converted)} destaque />
              <Ficha t={theme} rotulo="Faturado" valor={moeda(dados.team.revenue)} destaque />
              <Ficha t={theme} rotulo="Respostas" valor={String(dados.team.replies)} />
            </View>
            {dados.unassigned > 0 ? (
              // Não é enfeite: é a fila que ninguém pegou, e é acionável — a lista
              // de conversas tem o "assumir em lote" logo ali.
              <Text style={s.alerta}>
                {dados.unassigned === 1
                  ? "1 lead esperando sem responsável."
                  : `${dados.unassigned} leads esperando sem responsável.`}
              </Text>
            ) : null}
          </>
        ) : null}

        {dados && dados.rows.length > 0 ? (
          <>
            <Text style={s.secao}>{dados.isAdmin ? "Por atendente" : "Você"}</Text>
            <View style={s.grupo}>
              {dados.rows.map((r, i) => <Linha key={r.email} t={theme} r={r} primeira={i === 0} />)}
            </View>
          </>
        ) : null}

        {dados && dados.rows.length === 0 && !carregando ? (
          <Text style={s.vazio}>Nenhum atendimento registrado neste período.</Text>
        ) : null}

        {dados && !dados.isAdmin ? (
          <Text style={s.rodape}>
            Você vê apenas os seus números. O ranking completo é do administrador.
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Ficha({ t, rotulo, valor, destaque }: { t: ReturnType<typeof buildTheme>; rotulo: string; valor: string; destaque?: boolean }) {
  const s = styles(t);
  return (
    <View style={s.ficha} accessibilityRole="text" accessibilityLabel={`${rotulo}: ${valor}`}>
      <Text style={[s.fichaValor, destaque && { color: t.accent }]} numberOfLines={1}>{valor}</Text>
      <Text style={s.fichaRotulo}>{rotulo}</Text>
    </View>
  );
}

function Linha({ t, r, primeira }: { t: ReturnType<typeof buildTheme>; r: LinhaEquipe; primeira: boolean }) {
  const s = styles(t);
  return (
    <View>
      {!primeira ? <View style={s.divisor} /> : null}
      <View style={s.linha}>
        <View style={s.linhaTopo}>
          <Text style={s.nome} numberOfLines={1}>
            {r.name}{r.isMe ? " · você" : ""}
          </Text>
          <Text style={s.faturado}>{moeda(r.revenue)}</Text>
        </View>
        {/* Quatro números, não dez: o que decide o dia é quanto vendeu, quanto
            tem na mão, quem está esperando e a rapidez da primeira resposta. */}
        <View style={s.numeros}>
          <Num t={t} rotulo="vendas" valor={String(r.converted)} />
          <Num t={t} rotulo="leads" valor={String(r.owned)} />
          <Num t={t} rotulo="esperando" valor={String(r.waiting)} alerta={r.waiting > 0} />
          <Num t={t} rotulo="1ª resposta" valor={tempo(r.avgFirstResponseSec)} />
        </View>
      </View>
    </View>
  );
}

function Num({ t, rotulo, valor, alerta }: { t: ReturnType<typeof buildTheme>; rotulo: string; valor: string; alerta?: boolean }) {
  const s = styles(t);
  return (
    <View style={s.num} accessibilityRole="text" accessibilityLabel={`${rotulo}: ${valor}`}>
      <Text style={[s.numValor, alerta && { color: t.warn }]}>{valor}</Text>
      <Text style={s.numRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    fechar: { ...TIPO.subtitulo, color: t.accent, fontWeight: "600" },
    periodos: { flexDirection: "row", gap: ESP.sm, paddingHorizontal: ESP.gutter, paddingTop: ESP.md },
    periodo: { flex: 1, paddingVertical: 8, borderRadius: RAIO.peq, ...CURVA, alignItems: "center", backgroundColor: t.raise },
    periodoTexto: { ...TIPO.subtitulo, color: t.text },
    secao: { ...CABECALHO_SECAO, color: t.muted, paddingHorizontal: ESP.gutter, marginTop: ESP.xl, marginBottom: ESP.sm },
    grade: { flexDirection: "row", flexWrap: "wrap", gap: ESP.sm, paddingHorizontal: ESP.gutter },
    ficha: {
      flexGrow: 1, flexBasis: "46%", backgroundColor: t.surface, borderRadius: 14, ...CURVA,
      borderWidth: 1, borderColor: t.border, padding: ESP.md, gap: 2,
    },
    fichaValor: { ...TIPO.titulo2, color: t.text, fontVariant: ["tabular-nums"] },
    fichaRotulo: { ...TIPO.legenda, color: t.muted },
    alerta: { ...TIPO.nota, color: t.warn, paddingHorizontal: ESP.gutter, marginTop: ESP.sm },
    grupo: {
      backgroundColor: t.surface, borderRadius: 14, ...CURVA, borderWidth: 1, borderColor: t.border,
      marginHorizontal: ESP.gutter, overflow: "hidden",
    },
    divisor: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: ESP.md },
    linha: { padding: ESP.md, gap: ESP.sm },
    linhaTopo: { flexDirection: "row", alignItems: "center", gap: ESP.sm },
    nome: { ...TIPO.destaque, flex: 1, color: t.text },
    faturado: { ...TIPO.destaque, color: t.accent, fontWeight: "700", fontVariant: ["tabular-nums"] },
    numeros: { flexDirection: "row", gap: ESP.md },
    num: { flex: 1, gap: 1 },
    numValor: { ...TIPO.subtitulo, color: t.text, fontWeight: "600", fontVariant: ["tabular-nums"] },
    numRotulo: { ...TIPO.legenda, color: t.muted },
    vazio: { ...TIPO.corpo, color: t.muted, textAlign: "center", padding: ESP.xl },
    rodape: { ...TIPO.legenda, color: t.muted, textAlign: "center", paddingHorizontal: ESP.xl, marginTop: ESP.xl },
    erro: { ...TIPO.nota, color: t.crit, paddingHorizontal: ESP.gutter, marginTop: ESP.md },
  });
