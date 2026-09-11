// ── Ajustes do aplicativo ─────────────────────────────────────────────────────
// Divisão de papéis com o Perfil, que estava duplicado:
//   · Perfil (ícone de pessoa, à direita) = QUEM VOCÊ É — conta, aparelho, sair.
//   · Aqui (••• , à esquerda)             = COMO O APP SE COMPORTA.
//
// Módulos do portal que ainda não têm tela no app NÃO aparecem: listar o que
// não existe é promessa que a tela não cumpre — e, para a App Store, conteúdo
// de espaço reservado (diretriz 4.2). Cada um volta ao ganhar `rota`.

import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useEscuro } from "../src/ui/aparencia";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import { CABECALHO_SECAO, TIPO } from "../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../src/ui/forma";
import { useSession } from "../src/ui/session";
import { useAparencia, type Preferencia } from "../src/ui/aparencia";
import { useTema } from "../src/ui/tema";
import { buildTheme } from "../src/ui/theme";
import { DOCUMENTOS, urlDoDocumento } from "../src/config/legal";
import { appEnv } from "../src/config/env";
import type { PortalSection } from "../src/core/contracts";
import { relatorio, relevantes } from "../src/core/diagnostico";
import { lerDiario } from "../src/core/redact";

// Seções do portal que NÃO são aba. As que têm `rota` abrem no app; as demais
// são trabalho de mesa (configuração, auditoria) e seguem no portal web — e
// dizer isso é melhor do que sumir com elas, que fazia o app parecer incompleto.
//
// Antes esta lista inteira era filtrada por `m.rota` e NENHUMA entrada tinha uma:
// a seção "Ferramentas" nunca aparecia para ninguém.
const CATALOGO: { chave: PortalSection; rotulo: string; simbolo: string; rota?: string }[] = [
  { chave: "equipe", rotulo: "Equipe", simbolo: "person.2.fill", rota: "/equipe" },
  { chave: "painel", rotulo: "Painel", simbolo: "chart.bar.fill" },
  { chave: "ia", rotulo: "IA", simbolo: "sparkles" },
  { chave: "aprendizado", rotulo: "Aprendizado", simbolo: "graduationcap.fill" },
  { chave: "objecoes", rotulo: "Objeções", simbolo: "exclamationmark.bubble.fill" },
  { chave: "consumo", rotulo: "Consumo", simbolo: "gauge.medium" },
  { chave: "frete", rotulo: "Frete", simbolo: "shippingbox.fill" },
];

/** WhatsApp do suporte da Veloce. Formato internacional, só dígitos. */
const SUPORTE_WHATSAPP = "5551991597229";

const APARENCIAS: { valor: Preferencia; rotulo: string }[] = [
  { valor: "automatico", rotulo: "Automático" },
  { valor: "claro", rotulo: "Claro" },
  { valor: "escuro", rotulo: "Escuro" },
];

export default function Mais() {
  const { me, can, base } = useSession();
  const { preferencia, definir } = useAparencia();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTema();
  const s = styles(theme);

  const [permissao, setPermissao] = useState<"concedida" | "negada" | "?">("?");
  useEffect(() => {
    void Notifications.getPermissionsAsync()
      .then((p) => setPermissao(p.granted ? "concedida" : "negada"))
      .catch(() => setPermissao("?"));
  }, []);

  const modulos = CATALOGO.filter((m) => can(m.chave));

  const escolher = useCallback((p: Preferencia) => {
    void Haptics.selectionAsync().catch(() => {});
    definir(p);
  }, [definir]);

  // Suporte pelo WhatsApp, não por e-mail: é o canal em que a equipe já vive o
  // dia inteiro, e a resposta chega em minutos em vez de horas. A mensagem vai
  // pronta com o contexto que a gente sempre teria de perguntar depois.
  const pedirAjuda = useCallback(() => {
    const texto = encodeURIComponent(
      `Preciso de suporte no app da Veloce.\n\n` +
      `Cliente: ${me?.brand.name ?? "—"}\n` +
      `Usuário: ${me?.user?.email ?? "—"}\n` +
      `Aplicativo: ${Constants.expoConfig?.version ?? "—"}`,
    );
    void Linking.openURL(`https://wa.me/${SUPORTE_WHATSAPP}?text=${texto}`).catch(() => {});
  }, [me]);

  // "Deu erro" sem diagnóstico vira uma investigação do zero. O diário fica no
  // aparelho e só sai daqui — pela mão da pessoa, para onde ELA escolher. Nada
  // é enviado sozinho, e o conteúdo das conversas nunca entra no texto.
  const compartilharDiagnostico = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
    const diario = lerDiario();
    const texto = relatorio(diario, {
      versao: Constants.expoConfig?.version ?? "—",
      aparelho: Constants.deviceName ?? "—",
      sistema: `${Platform.OS} ${String(Platform.Version)}`,
      servidor: base ?? "—",
    });
    void Share.share({ message: texto }).catch(() => {});
  }, [base]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Ajustes",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
              <Text style={s.fechar}>Fechar</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={s.tela}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: insets.bottom + ESP.xxl + ESP.gutter }}
      >
        {/* ── Aparência ─────────────────────────────────────────────────── */}
        <Text style={s.secao}>Aparência</Text>
        <View style={s.grupo}>
          <View style={s.seletor}>
            {APARENCIAS.map(({ valor, rotulo }) => {
              const on = preferencia === valor;
              return (
                <Pressable
                  key={valor}
                  onPress={() => escolher(valor)}
                  style={[s.opcao, on && s.opcaoAtiva]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.opcaoTexto, on && s.opcaoTextoAtivo]}>{rotulo}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.dica}>
            &quot;Automático&quot; acompanha o iPhone. As outras valem só para este aplicativo.
          </Text>
        </View>

        {/* ── Notificações ──────────────────────────────────────────────── */}
        <Text style={s.secao}>Notificações</Text>
        <View style={s.grupo}>
          <Pressable style={s.linha} onPress={() => void Linking.openSettings()} accessibilityRole="button">
            <View style={[s.icone, { backgroundColor: permissao === "concedida" ? theme.good : theme.muted }]}>
              <Simbolo nome={"bell.fill" as never} tamanho={15} cor="#fff" />
            </View>
            <View style={s.corpo}>
              <Text style={s.linhaTitulo}>
                {permissao === "concedida" ? "Ativadas" : permissao === "negada" ? "Desativadas" : "Verificando…"}
              </Text>
              <Text style={s.linhaSub}>Avisos de lead novo e de orçamento aguardando</Text>
            </View>
            <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" />
          </Pressable>
        </View>

        {/* ── Ferramentas do portal com tela no app ─────────────────────── */}
        {modulos.length > 0 ? (
          <>
            <Text style={s.secao}>Ferramentas</Text>
            <View style={s.grupo}>
              {modulos.map(({ chave, rotulo, simbolo, rota }, i) => (
                <View key={chave}>
                  {i > 0 ? <View style={s.divisor} /> : null}
                  <Pressable
                    onPress={() => rota && router.push(rota as never)}
                    disabled={!rota}
                    style={({ pressed }) => [s.linha, pressed && rota && { backgroundColor: theme.raise }]}
                    accessibilityRole={rota ? "button" : "text"}
                    accessibilityLabel={rota ? `Abrir ${rotulo}` : `${rotulo}: disponível no portal web`}
                  >
                    <View style={[s.icone, { backgroundColor: rota ? theme.accent : theme.muted }]}>
                      <Simbolo nome={simbolo as never} tamanho={15} cor="#fff" />
                    </View>
                    <View style={s.corpo}>
                      <Text style={s.linhaTitulo}>{rotulo}</Text>
                      {!rota ? <Text style={s.linhaSub}>Disponível no portal web</Text> : null}
                    </View>
                    {rota ? <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" /> : null}
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* ── Ajuda e documentos ────────────────────────────────────────── */}
        <Text style={s.secao}>Ajuda</Text>
        <View style={s.grupo}>
          <Pressable style={s.linha} onPress={pedirAjuda} accessibilityRole="button">
            <View style={[s.icone, { backgroundColor: "#25D366" }]}>
              <Simbolo nome={"bubble.left.fill" as never} tamanho={15} cor="#fff" />
            </View>
            <View style={s.corpo}>
              <Text style={s.linhaTitulo}>Falar com a Veloce</Text>
              <Text style={s.linhaSub}>Abre o WhatsApp com a mensagem pronta</Text>
            </View>
            <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" />
          </Pressable>
          <View style={s.divisor} />
          <Pressable
            style={({ pressed }) => [s.linha, pressed && { backgroundColor: theme.raise }]}
            onPress={compartilharDiagnostico}
            accessibilityRole="button"
          >
            <View style={[s.icone, { backgroundColor: theme.warn }]}>
              <Simbolo nome={"stethoscope" as never} tamanho={15} cor="#fff" />
            </View>
            <View style={s.corpo}>
              <Text style={s.linhaTitulo}>Enviar diagnóstico</Text>
              <Text style={s.linhaSub}>
                {(() => {
                  const n = relevantes(lerDiario()).length;
                  return n === 0 ? "Nenhum erro nesta sessão" : n === 1 ? "1 ocorrência registrada" : `${n} ocorrências registradas`;
                })()}
              </Text>
            </View>
            <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" />
          </Pressable>
          {DOCUMENTOS.map((d) => (
            <View key={d.caminho}>
              <View style={s.divisor} />
              <Pressable
                style={({ pressed }) => [s.linha, pressed && { backgroundColor: theme.raise }]}
                onPress={() => base && void Linking.openURL(urlDoDocumento(base, d.caminho))}
                disabled={!base}
                accessibilityRole="link"
              >
                <View style={[s.icone, { backgroundColor: theme.muted }]}>
                  <Simbolo nome={"doc.text.fill" as never} tamanho={15} cor="#fff" />
                </View>
                <Text style={[s.linhaTitulo, s.corpo]}>{d.titulo}</Text>
                <Simbolo nome={SIMBOLO.avancar as never} tamanho={14} cor={theme.muted} peso="semibold" />
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={s.rodape}>
          Veloce {Constants.expoConfig?.version ?? ""}
          {appEnv() === "production" ? "" : ` · ${appEnv()}`}
        </Text>
      </ScrollView>
    </>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    fechar: { color: t.accent, fontSize: 16, fontWeight: "600" },

    secao: { ...CABECALHO_SECAO, color: t.muted, marginHorizontal: ESP.gutter + 4, marginTop: ESP.lg, marginBottom: ESP.sm },
    grupo: { marginHorizontal: ESP.gutter, borderRadius: RAIO.medio, ...CURVA, overflow: "hidden", backgroundColor: t.surface },
    divisor: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 54 },

    linha: { flexDirection: "row", alignItems: "center", gap: ESP.md, paddingHorizontal: ESP.gutter, paddingVertical: 11 },
    corpo: { flex: 1 },
    linhaTitulo: { ...TIPO.corpo, color: t.text },
    linhaSub: { ...TIPO.legenda, color: t.muted, marginTop: 1 },
    icone: { width: 29, height: 29, borderRadius: 7, ...CURVA, alignItems: "center", justifyContent: "center" },

    seletor: { flexDirection: "row", gap: 4, backgroundColor: t.raise, borderRadius: RAIO.peq, ...CURVA, padding: 4, margin: ESP.md },
    opcao: { flex: 1, paddingVertical: 8, borderRadius: 8, ...CURVA, alignItems: "center" },
    opcaoAtiva: { backgroundColor: t.surface, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
    opcaoTexto: { ...TIPO.subtitulo, color: t.muted, fontWeight: "500" },
    opcaoTextoAtivo: { color: t.text, fontWeight: "700" },
    dica: { ...TIPO.legenda, color: t.muted, paddingHorizontal: ESP.gutter, paddingBottom: ESP.md, lineHeight: 16 },

    rodape: { ...TIPO.legenda2, color: t.muted, textAlign: "center", marginTop: ESP.xl },
  });
