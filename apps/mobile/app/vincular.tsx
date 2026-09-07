// ── Entrada no aplicativo ─────────────────────────────────────────────────────
// O portal web já sabe de qual loja é antes de pedir a senha: o token está na
// URL que a pessoa abriu. O app não tem URL — então o primeiro passo é o link,
// e só depois o formulário.
//
// Mas a espera não precisa ser cega: com o link em mãos, `/me` devolve a marca
// (logo, nome e cor) SEM credencial. Então o segundo passo já aparece vestido
// da loja, igual ao portal — o app é da Veloce, o momento é do cliente.
//
// O e-mail NÃO identifica a loja (PortalAccess é único por clientId+email), por
// isso o link é obrigatório no primeiro acesso e nunca mais depois.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useEscuro } from "../src/ui/aparencia";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn } from "react-native-reanimated";
import * as Linking from "expo-linking";
import * as Haptics from "expo-haptics";
import { useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";
import { TIPO } from "../src/ui/tipografia";
import { CURVA, ESP, RAIO } from "../src/ui/forma";
import { SIMBOLO, Simbolo } from "../src/ui/simbolo";
import { ApiError } from "../src/core/errors";
import { InviteLinkError, parseInviteLink } from "../src/core/link";
import { urlDoDocumento } from "../src/config/legal";
import { devPrefill, temPrefill } from "../src/config/dev-prefill";
import type { Me } from "../src/core/contracts";

type Passo = "link" | "credencial";
type Modo = "entrar" | "criar";

export default function Vincular() {
  const { vincularELogar, vincularECriar, marcaDoLink, configError, painelSalvo, esquecerPainel } = useSession();
  const insets = useSafeAreaInsets();
  const escuro = useEscuro();

  const dev = useMemo(() => devPrefill(), []);
  const [link, setLink] = useState(dev.link);
  const [email, setEmail] = useState(dev.email);
  const [senha, setSenha] = useState(dev.senha);
  const [nome, setNome] = useState("");

  const [passo, setPasso] = useState<Passo>("link");
  const [modo, setModo] = useState<Modo>("entrar");
  const [marca, setMarca] = useState<Me | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // A cor do cliente entra assim que ela é conhecida; antes disso, a da Veloce.
  const theme = buildTheme(marca?.brand ?? null, escuro);
  const s = styles(theme);

  // Painel já vinculado neste aparelho: pula o link e busca a marca de cara.
  // É o caso comum depois do primeiro acesso — sair da conta não deve obrigar
  // ninguém a procurar de novo o link que a agência mandou.
  useEffect(() => {
    if (!painelSalvo || passo === "credencial") return;
    const salvo = `${painelSalvo.base}/r/${painelSalvo.token}`;
    setLink(salvo);
    setPasso("credencial");
    void marcaDoLink(salvo).then(setMarca);
  }, [painelSalvo, passo, marcaDoLink]);

  // Link do painel aberto no iPhone preenche o campo — e já avança.
  useEffect(() => {
    const aplicar = (url: string | null) => {
      if (!url) return;
      try { parseInviteLink(url); setLink(url); } catch { /* link de outra coisa */ }
    };
    void Linking.getInitialURL().then(aplicar);
    const sub = Linking.addEventListener("url", (e) => aplicar(e.url));
    return () => sub.remove();
  }, []);

  const abrirDocumento = useCallback((caminho: string) => {
    try {
      void Linking.openURL(urlDoDocumento(new URL(link.trim()).origin, caminho));
    } catch {
      setErro("Cole o link do seu painel para abrir este documento.");
    }
  }, [link]);

  /** Valida o link e busca a marca. Só então mostra o formulário. */
  const avancar = useCallback(async () => {
    setErro(null);
    try {
      parseInviteLink(link);
    } catch (e) {
      setErro(e instanceof InviteLinkError ? e.message : "Link inválido.");
      return;
    }
    setBuscando(true);
    const m = await marcaDoLink(link);
    setBuscando(false);
    setMarca(m);
    // Sem `requireLogin` não há senha a pedir — mas o backend ainda exige uma
    // conta para o app. Avisamos em vez de deixar o usuário tentar às cegas.
    if (m && m.requireLogin === false) {
      setErro("Este painel não usa login por senha. Peça à sua agência para criar seu acesso.");
      return;
    }
    void Haptics.selectionAsync().catch(() => {});
    setPasso("credencial");
  }, [link, marcaDoLink]);

  const entrar = useCallback(async () => {
    setErro(null);
    setEnviando(true);
    try {
      if (modo === "entrar") await vincularELogar(link, email, senha);
      else await vincularECriar(link, email, senha, nome);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      if (e instanceof InviteLinkError || e instanceof ApiError) setErro(e.message);
      else setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }, [modo, link, email, senha, nome, vincularELogar, vincularECriar]);

  const podeEntrar = email.trim().length > 3 && senha.length > 0 && !enviando;
  const inicial = (marca?.brand.name ?? "V").slice(0, 1).toUpperCase();

  return (
    <KeyboardAvoidingView style={s.tela} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[s.rolagem, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* O cartão cresce e encolhe com o conteúdo, sem salto. */}
        <Animated.View style={s.cartao} layout={LinearTransition.duration(260)}>
          <Animated.View style={s.marcaBox} entering={ZoomIn.duration(320).springify()} layout={LinearTransition}>
            {marca?.brand.logoUrl ? (
              <Image source={{ uri: marca.brand.logoUrl }} style={s.logo} resizeMode="contain" />
            ) : (
              <View style={[s.logo, s.logoVazio]}>
                <Text style={s.logoLetra}>{inicial}</Text>
              </View>
            )}
          </Animated.View>

          <Animated.Text style={s.titulo} layout={LinearTransition}>
            {marca?.brand.name ?? "Veloce"}
          </Animated.Text>
          <Animated.Text style={s.subtitulo} layout={LinearTransition}>
            {passo === "link"
              ? "Cole o link do painel que a sua agência enviou. Ele identifica a sua loja e só é pedido uma vez."
              : modo === "entrar"
                ? "Entre com seu e-mail e senha para acessar o painel."
                : "Crie seu acesso ao painel com e-mail e senha."}
          </Animated.Text>

          {configError ? (
            <Animated.View style={s.aviso} entering={FadeIn}>
              <Text style={s.avisoTexto}>{configError}</Text>
            </Animated.View>
          ) : null}

          {temPrefill(dev) ? (
            <View style={s.aviso}><Text style={s.avisoTexto}>Modo de desenvolvimento: campos preenchidos.</Text></View>
          ) : null}

          {passo === "link" ? (
            <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOut.duration(120)} layout={LinearTransition}>
              <Campo
                icone={SIMBOLO.avancar}
                valor={link}
                aoMudar={setLink}
                placeholder="https://…/r/…"
                teclado="url"
                theme={theme}
                aoEnviar={() => void avancar()}
              />
              <Botao
                rotulo={buscando ? "Verificando…" : "Continuar"}
                ocupado={buscando}
                ativo={link.trim().length > 0 && !buscando}
                aoTocar={() => void avancar()}
                theme={theme}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(280)} layout={LinearTransition}>
              {/* Entrar / Criar conta — as mesmas duas portas do portal. */}
              <View style={s.abas}>
                {(["entrar", "criar"] as Modo[]).map((m) => {
                  const on = modo === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => { void Haptics.selectionAsync().catch(() => {}); setModo(m); setErro(null); }}
                      style={[s.aba, on && s.abaAtiva]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.abaTexto, on && s.abaTextoAtivo]}>
                        {m === "entrar" ? "Entrar" : "Criar conta"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {modo === "criar" ? (
                <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}>
                  <Campo icone={SIMBOLO.pessoa} valor={nome} aoMudar={setNome} placeholder="Seu nome (opcional)" theme={theme} />
                </Animated.View>
              ) : null}

              <Campo icone={SIMBOLO.busca} valor={email} aoMudar={setEmail} placeholder="voce@sualoja.com" teclado="email-address" theme={theme} />
              <Campo icone={SIMBOLO.cadeado} valor={senha} aoMudar={setSenha} placeholder="Senha" secreto theme={theme} aoEnviar={() => { if (podeEntrar) void entrar(); }} />

              <Botao
                rotulo={enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta e entrar"}
                ocupado={enviando}
                ativo={podeEntrar}
                aoTocar={() => void entrar()}
                theme={theme}
              />

              <Text style={s.ajuda}>
                {modo === "entrar"
                  ? "Ainda não tem acesso? Toque em “Criar conta”."
                  : "Já tem conta? Toque em “Entrar”."}
              </Text>
              {modo === "entrar" ? (
                <Text style={s.ajudaFraca}>Esqueceu a senha? Peça ao administrador do painel para reiniciar seu acesso.</Text>
              ) : null}

              <Pressable
                onPress={() => {
                  // Esquecer o painel é o caminho para trocar de loja — e é o
                  // que apaga o token guardado no Keychain.
                  void esquecerPainel();
                  setMarca(null);
                  setLink("");
                  setPasso("link");
                  setErro(null);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={s.trocar}>Usar outro painel</Text>
              </Pressable>
            </Animated.View>
          )}

          {erro ? (
            <Animated.Text style={s.erro} entering={FadeIn.duration(180)}>{erro}</Animated.Text>
          ) : null}

          <View style={s.legal}>
            {[["/termos", "Termos"], ["/privacy", "Privacidade"], ["/exclusao-de-dados", "Exclusão de dados"]].map(([caminho, rotulo]) => (
              <Pressable key={caminho} onPress={() => abrirDocumento(caminho!)} hitSlop={6} accessibilityRole="link">
                <Text style={s.legalTexto}>{rotulo}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Text style={s.rodape}>Veloce · atendimento dos seus leads no WhatsApp</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Campo({ icone, valor, aoMudar, placeholder, teclado, secreto, theme, aoEnviar }: {
  icone: string; valor: string; aoMudar: (v: string) => void; placeholder: string;
  teclado?: "url" | "email-address"; secreto?: boolean;
  theme: ReturnType<typeof buildTheme>; aoEnviar?: () => void;
}) {
  const s = styles(theme);
  const [focado, setFocado] = useState(false);
  return (
    <View style={[s.campo, focado && { borderColor: theme.accent }]}>
      <Simbolo nome={icone as never} tamanho={17} cor={focado ? theme.accent : theme.muted} />
      <TextInput
        style={s.campoTexto}
        value={valor}
        onChangeText={aoMudar}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={teclado}
        secureTextEntry={secreto}
        returnKeyType={aoEnviar ? "go" : "next"}
        onSubmitEditing={aoEnviar}
      />
    </View>
  );
}

function Botao({ rotulo, ativo, ocupado, aoTocar, theme }: {
  rotulo: string; ativo: boolean; ocupado: boolean; aoTocar: () => void;
  theme: ReturnType<typeof buildTheme>;
}) {
  const s = styles(theme);
  return (
    <Pressable
      onPress={aoTocar}
      disabled={!ativo}
      accessibilityRole="button"
      style={({ pressed }) => [s.botao, !ativo && s.botaoOff, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
    >
      {ocupado ? <ActivityIndicator color={theme.onAccent} /> : <Text style={s.botaoTexto}>{rotulo}</Text>}
    </Pressable>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.bg },
    rolagem: { flexGrow: 1, justifyContent: "center", paddingHorizontal: ESP.lg },

    cartao: {
      backgroundColor: t.surface, borderRadius: 22, ...CURVA, padding: ESP.xl,
      shadowColor: "#000", shadowOpacity: t.dark ? 0.5 : 0.12,
      shadowRadius: 30, shadowOffset: { width: 0, height: 14 },
    },

    marcaBox: { alignItems: "center", marginBottom: ESP.md },
    logo: { width: 72, height: 72, borderRadius: 18, ...CURVA },
    logoVazio: { backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    logoLetra: { ...TIPO.titulo2, fontSize: 30, fontWeight: "800", color: t.onAccent },

    titulo: { ...TIPO.titulo2, color: t.text, textAlign: "center" },
    subtitulo: { ...TIPO.subtitulo, color: t.muted, textAlign: "center", marginTop: ESP.xs, lineHeight: 20 },

    abas: { flexDirection: "row", gap: 4, backgroundColor: t.raise, borderRadius: RAIO.peq, ...CURVA, padding: 4, marginTop: ESP.lg },
    aba: { flex: 1, paddingVertical: 8, borderRadius: 8, ...CURVA, alignItems: "center" },
    abaAtiva: { backgroundColor: t.surface, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
    abaTexto: { ...TIPO.subtitulo, color: t.muted, fontWeight: "500" },
    abaTextoAtivo: { color: t.text, fontWeight: "700" },

    campo: {
      flexDirection: "row", alignItems: "center", gap: ESP.sm, height: 52,
      paddingHorizontal: ESP.gutter, borderRadius: 13, ...CURVA,
      borderWidth: 1.5, borderColor: t.border, backgroundColor: t.bg, marginTop: 11,
    },
    campoTexto: { flex: 1, ...TIPO.corpo, color: t.text, padding: 0 },

    botao: {
      height: 50, borderRadius: 13, ...CURVA, backgroundColor: t.accent,
      alignItems: "center", justifyContent: "center", marginTop: ESP.gutter,
    },
    botaoOff: { opacity: 0.45 },
    botaoTexto: { ...TIPO.destaque, color: t.onAccent, fontWeight: "700" },

    ajuda: { ...TIPO.nota, color: t.muted, textAlign: "center", marginTop: ESP.gutter },
    ajudaFraca: { ...TIPO.legenda, color: t.muted, textAlign: "center", marginTop: ESP.xs, opacity: 0.85 },
    trocar: { ...TIPO.nota, color: t.accent, textAlign: "center", marginTop: ESP.md, fontWeight: "600" },

    erro: { ...TIPO.nota, color: t.crit, textAlign: "center", marginTop: ESP.md },

    aviso: { backgroundColor: t.raise, borderRadius: RAIO.peq, ...CURVA, padding: ESP.md, marginTop: ESP.md },
    avisoTexto: { ...TIPO.legenda, color: t.muted, lineHeight: 17 },

    legal: {
      flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: ESP.md,
      marginTop: ESP.lg, paddingTop: ESP.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },
    legalTexto: { ...TIPO.legenda2, color: t.muted, textDecorationLine: "underline" },

    rodape: { ...TIPO.legenda2, color: t.muted, textAlign: "center", marginTop: ESP.lg },
  });
