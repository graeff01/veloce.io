// ── Barreira de erro ──────────────────────────────────────────────────────────
// Em desenvolvimento, um erro de renderização mostra a tela vermelha do Metro.
// Num build de release não há tela vermelha: a árvore desmonta e sobra BRANCO,
// sem texto e sem saída. A pessoa fecha o app e não sabe o que houve.
//
// Aqui o erro vira uma tela que explica, deixa tentar de novo e — o que mais
// importa no suporte — permite mandar o detalhe técnico pelo WhatsApp.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { lerDiario, log } from "../core/redact";
import { relevantes } from "../core/diagnostico";

const SUPORTE_WHATSAPP = "5551991597229";

interface Props { children: ReactNode }
interface State { erro: Error | null; pilha: string | null }

export class BarreiraDeErro extends Component<Props, State> {
  override state: State = { erro: null, pilha: null };

  static getDerivedStateFromError(erro: Error): Partial<State> {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo) {
    // Só a mensagem no log: a pilha pode citar caminhos e dados de tela.
    log.warn(`erro de renderização: ${erro.message}`);
    this.setState({ pilha: info.componentStack ?? null });
  }

  private relatar = () => {
    const { erro, pilha } = this.state;
    // O que aconteceu ANTES do travamento costuma explicar o travamento. Vão só
    // as três últimas ocorrências: a URL do WhatsApp tem limite, e o resto está
    // no "Enviar diagnóstico", em Ajustes.
    const antes = relevantes(lerDiario()).slice(-3).map((o) => o.texto).join(" | ").slice(0, 300);
    const texto = encodeURIComponent(
      `O app da Veloce travou.\n\n` +
      `Erro: ${erro?.message ?? "desconhecido"}\n` +
      `Aplicativo: ${Constants.expoConfig?.version ?? "—"}\n` +
      `Onde: ${(pilha ?? "").split("\n").slice(0, 4).join(" › ").trim() || "—"}\n` +
      `Antes disso: ${antes || "—"}`,
    );
    void Linking.openURL(`https://wa.me/${SUPORTE_WHATSAPP}?text=${texto}`).catch(() => {});
  };

  private tentarDeNovo = () => this.setState({ erro: null, pilha: null });

  override render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <View style={e.tela}>
        <ScrollView contentContainerStyle={e.conteudo}>
          <Text style={e.titulo}>Alguma coisa quebrou</Text>
          <Text style={e.texto}>
            O aplicativo encontrou um erro e parou esta tela. Nada do que você
            escreveu foi perdido — as mensagens na fila continuam guardadas.
          </Text>

          <Pressable style={e.botao} onPress={this.tentarDeNovo} accessibilityRole="button">
            <Text style={e.botaoTexto}>Tentar de novo</Text>
          </Pressable>

          <Pressable style={e.botaoNeutro} onPress={this.relatar} accessibilityRole="button">
            <Text style={e.botaoNeutroTexto}>Avisar a Veloce pelo WhatsApp</Text>
          </Pressable>

          {/* Detalhe técnico visível: quem está no suporte lê pelo telefone da
              pessoa, sem depender de ela saber descrever. */}
          <Text style={e.detalhe} selectable>{erro.message}</Text>
        </ScrollView>
      </View>
    );
  }
}

// Cores fixas de propósito: o tema depende de contexto, e o contexto pode ser
// exatamente o que quebrou.
const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: "#f5f6f9" },
  conteudo: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 14 },
  titulo: { fontSize: 22, fontWeight: "700", color: "#0f1218", textAlign: "center" },
  texto: { fontSize: 15, lineHeight: 21, color: "#697086", textAlign: "center" },
  botao: {
    height: 50, borderRadius: 13, backgroundColor: "#1e66f5",
    alignItems: "center", justifyContent: "center", marginTop: 10,
  },
  botaoTexto: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  botaoNeutro: {
    height: 48, borderRadius: 13, backgroundColor: "#e6e8ee",
    alignItems: "center", justifyContent: "center",
  },
  botaoNeutroTexto: { fontSize: 15, fontWeight: "600", color: "#0f1218" },
  detalhe: { fontSize: 12, color: "#9aa1b1", textAlign: "center", marginTop: 8 },
});
