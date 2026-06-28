"use client";

import { useState } from "react";

// Compartilhar o painel (o dono manda pro sócio) + salvar como PDF (print).
export function PortalShare() {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: document.title || "Painel", url }); return; } catch { /* cancelado */ } }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9,
    border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--p-text)",
    fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" onClick={share} style={btn}>{copied ? "✓ Copiado" : "↗ Compartilhar"}</button>
      <button type="button" onClick={() => window.print()} style={btn} title="Salvar como PDF">⤓ PDF</button>
    </div>
  );
}
