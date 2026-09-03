import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, useColorScheme, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { useSession } from "../src/ui/session";
import { buildTheme } from "../src/ui/theme";
import { ApiError } from "../src/core/errors";
import { InviteLinkError, parseInviteLink } from "../src/core/link";

// ── Vínculo do aparelho + login ───────────────────────────────────────────────
// O e-mail NÃO identifica a loja (PortalAccess é único por clientId+email), então
// o primeiro acesso precisa do link do painel — o mesmo que a loja já recebe hoje.
// Depois disso o link não é mais pedido: o app vive da sessão.

export default function Vincular() {
  const { vincularELogar, configError } = useSession();
  const insets = useSafeAreaInsets();
  const theme = buildTheme(null, useColorScheme() === "dark");

  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Universal Link / deep link: abrir o link do painel no iPhone já preenche o campo.
  useEffect(() => {
    const aplicar = (url: string | null) => {
      if (!url) return;
      try { parseInviteLink(url); setLink(url); } catch { /* link de outra coisa */ }
    };
    void Linking.getInitialURL().then(aplicar);
    const sub = Linking.addEventListener("url", (e) => aplicar(e.url));
    return () => sub.remove();
  }, []);

  const entrar = useCallback(async () => {
    setErro(null);
    setEnviando(true);
    try {
      await vincularELogar(link, email, senha);
    } catch (e) {
      if (e instanceof InviteLinkError) setErro(e.message);
      else if (e instanceof ApiError) setErro(e.message);
      else setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }, [link, email, senha, vincularELogar]);

  const pronto = link.trim().length > 0 && email.trim().length > 3 && senha.length > 0 && !enviando;
  const s = styles(theme);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.marca}>Veloce</Text>
        <Text style={s.sub}>Atendimento dos seus leads no WhatsApp.</Text>

        {configError ? (
          <View style={s.aviso}>
            <Text style={s.avisoTexto}>{configError}</Text>
          </View>
        ) : null}

        <Text style={s.rotulo}>Link do seu painel</Text>
        <TextInput
          style={s.campo}
          value={link}
          onChangeText={setLink}
          placeholder="https://…/r/…"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
        />
        <Text style={s.dica}>É o mesmo link que você já usa no navegador. Só é pedido nesta primeira vez.</Text>

        <Text style={s.rotulo}>E-mail</Text>
        <TextInput
          style={s.campo}
          value={email}
          onChangeText={setEmail}
          placeholder="voce@sualoja.com"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
        />

        <Text style={s.rotulo}>Senha</Text>
        <TextInput
          style={s.campo}
          value={senha}
          onChangeText={setSenha}
          placeholder="••••••••"
          placeholderTextColor={theme.muted}
          secureTextEntry
          textContentType="password"
          onSubmitEditing={() => { if (pronto) void entrar(); }}
        />

        {erro ? <Text style={s.erro}>{erro}</Text> : null}

        <Pressable
          style={[s.botao, !pronto && s.botaoOff]}
          onPress={() => void entrar()}
          disabled={!pronto}
          accessibilityRole="button"
          accessibilityLabel="Entrar"
        >
          {enviando ? <ActivityIndicator color={theme.onAccent} /> : <Text style={s.botaoTexto}>Entrar</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (t: ReturnType<typeof buildTheme>) =>
  StyleSheet.create({
    scroll: { paddingHorizontal: 24, gap: 6 },
    marca: { fontSize: 34, fontWeight: "800", color: t.text, letterSpacing: -0.5 },
    sub: { fontSize: 15, color: t.muted, marginBottom: 28 },
    rotulo: { fontSize: 13, fontWeight: "600", color: t.text, marginTop: 18, marginBottom: 6 },
    campo: {
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: t.text,
    },
    dica: { fontSize: 12, color: t.muted, marginTop: 6 },
    erro: { color: t.crit, fontSize: 14, marginTop: 16 },
    aviso: { backgroundColor: t.surface, borderColor: t.crit, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
    avisoTexto: { color: t.crit, fontSize: 13 },
    botao: {
      backgroundColor: t.accent, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", justifyContent: "center", marginTop: 28, minHeight: 54,
    },
    botaoOff: { opacity: 0.4 },
    botaoTexto: { color: t.onAccent, fontSize: 16, fontWeight: "700" },
  });
