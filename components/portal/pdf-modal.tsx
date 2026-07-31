"use client";

import { X, ExternalLink } from "lucide-react";

// Visualizador de PDF DENTRO do app (portal PWA). Antes o "Ver PDF" usava target="_blank",
// que num PWA standalone joga o PDF pro NAVEGADOR (nova aba, perde a barra do app). O modal
// mantém a experiência de app; o link "abrir em nova aba" fica só como escape (ex.: iOS, onde
// o iframe de PDF às vezes não renderiza inline).
export function PdfModal({ url, title, onClose }: { url: string | null; title?: string; onClose: () => void }) {
  if (!url) return null;
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", display: "flex", flexDirection: "column" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--p-bg, #fff)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--p-border, #e5e7eb)", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--p-text, #111)" }}>{title || "Orçamento"}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" style={{ color: "var(--p-muted, #666)", display: "inline-flex" }}><ExternalLink size={18} /></a>
            <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-text, #111)", display: "inline-flex", padding: 4 }}><X size={22} /></button>
          </div>
        </div>
        <iframe src={url} title={title || "PDF do orçamento"} style={{ flex: 1, width: "100%", border: "none", background: "#fff" }} />
      </div>
    </div>
  );
}
