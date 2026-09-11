"use client";

// ── Barreira de erro do portal ────────────────────────────────────────────────
// Não existia nenhuma: um erro de renderização entregava à vendedora a tela
// genérica do Next ("Application error: a client-side exception has occurred"),
// sem saída e sem como avisar ninguém. É o mesmo buraco que o aplicativo tinha
// antes da BarreiraDeErro, e a correção é a mesma — dizer o que houve, oferecer
// uma saída e um caminho para pedir ajuda com o contexto já pronto.
//
// O texto do erro NÃO aparece para o usuário: pode citar caminho de arquivo e
// dado de tela. Vai só no relato pelo WhatsApp, que é ela quem dispara.

import { useEffect } from "react";

/** WhatsApp do suporte da Veloce. Formato internacional, só dígitos. */
const SUPORTE = "5551991597229";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Só a mensagem no console: a pilha pode citar caminhos e conteúdo de tela.
    console.error("[portal] erro de renderização:", error.message);
  }, [error]);

  const relatar = () => {
    const texto = encodeURIComponent(
      "O painel da Veloce apresentou um erro.\n\n" +
      `Erro: ${error.message || "desconhecido"}\n` +
      // `digest` é o identificador que o Next grava no servidor — é por ele que
      // a gente encontra o rastro completo sem pedir print à vendedora.
      `Código: ${error.digest ?? "—"}`,
    );
    window.open(`https://wa.me/${SUPORTE}?text=${texto}`, "_blank", "noreferrer");
  };

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--p-bg, #f6f7f9)" }}>
      <div style={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", gap: 14 }}>
        <div aria-hidden style={{ fontSize: 38, lineHeight: 1 }}>⚠️</div>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--p-text, #14171d)" }}>
          Algo deu errado ao abrir esta tela
        </h1>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "var(--p-muted, #697086)" }}>
          As conversas e os dados do seu cliente estão a salvo — foi a tela que
          falhou ao montar. Tente de novo; se continuar, avise a gente.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button onClick={reset}
            style={{ height: 44, borderRadius: 12, border: "none", background: "var(--p-accent, #3358ff)", color: "var(--p-on-accent, #fff)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Tentar de novo
          </button>
          <button onClick={relatar}
            style={{ height: 44, borderRadius: 12, border: "1px solid var(--p-border, #d8dce4)", background: "transparent", color: "var(--p-text, #14171d)", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>
            Avisar a Veloce pelo WhatsApp
          </button>
        </div>
      </div>
    </main>
  );
}
