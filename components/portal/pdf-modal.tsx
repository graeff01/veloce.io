"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Loader2 } from "lucide-react";

// Visualizador de PDF DENTRO do app (portal PWA). Renderiza o PDF com PDF.js em <canvas>
// AJUSTADO À LARGURA da tela — no iPhone o iframe nativo mostrava o A4 em tamanho de PC
// (precisava arrastar pro lado). Aqui cada página é desenhada na largura do container, então
// fica legível e responsivo no telefone. O ARQUIVO enviado ao cliente segue A4 original.
export function PdfModal({ url, title, onClose }: { url: string | null; title?: string; onClose: () => void }) {
  if (!url) return null;
  return <PdfModalInner url={url} title={title} onClose={onClose} />;
}

function PdfModalInner({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        const host = pagesRef.current;
        if (cancelled || !host) return;
        host.innerHTML = "";
        const cw = Math.max(280, host.clientWidth); // largura útil p/ ajustar as páginas
        const dpr = Math.min(window.devicePixelRatio || 1, 2); // nitidez sem estourar memória
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (cw / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = "100%"; canvas.style.height = "auto";
          canvas.style.display = "block"; canvas.style.margin = "0 auto 10px";
          canvas.style.borderRadius = "6px"; canvas.style.boxShadow = "0 2px 10px rgba(0,0,0,.35)";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
          if (cancelled) return;
          host.appendChild(canvas);
        }
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", display: "flex", flexDirection: "column" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--p-bg, #fff)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--p-border, #e5e7eb)", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--p-text, #111)" }}>{title || "Orçamento"}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" style={{ color: "var(--p-muted, #666)", display: "inline-flex" }}><ExternalLink size={18} /></a>
            <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-text, #111)", display: "inline-flex", padding: 4 }}><X size={22} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "#3a3b3d", padding: 10, WebkitOverflowScrolling: "touch", position: "relative" }}>
          <div ref={pagesRef} />
          {state === "loading" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", gap: 8 }}>
              <Loader2 size={20} className="animate-spin" /> <span style={{ fontSize: 13 }}>Carregando orçamento…</span>
            </div>
          )}
          {state === "error" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 30, color: "#fff", textAlign: "center", minHeight: 200 }}>
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>Não consegui exibir o PDF aqui.</span>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, background: "var(--p-accent, #2563eb)", color: "#fff", textDecoration: "none", fontSize: 13.5, fontWeight: 700 }}>
                <ExternalLink size={16} /> Abrir em nova aba
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
