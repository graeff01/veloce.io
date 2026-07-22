"use client";

import { useState } from "react";
import { Mic, Image, FileText, Video, Download, AlertCircle, Loader2 } from "lucide-react";

// Exibe a mídia de uma WaMessage para o OPERADOR (espelhamento/auditoria).
// Baixa via proxy do servidor — nada vai para terceiros. A IA NÃO usa este
// componente; ela apenas reconhece o tipo por marcador e segue suas regras.
export function MediaContent({ url: urlProp, clientId, msgId, type, caption, filename }: {
  url?: string; clientId?: string; msgId?: string; type: string; caption: string | null; filename?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  // URL direta (ex.: portal) ou monta a de admin a partir de clientId+msgId.
  const url = urlProp ?? `/api/clients/${clientId}/whatsapp/media/${msgId}`;

  const icon: Record<string, React.ReactNode> = {
    audio: <Mic size={12} />, image: <Image size={12} />, sticker: <Image size={12} />,
    document: <FileText size={12} />, video: <Video size={12} />,
  };
  const label: Record<string, string> = {
    audio: "Áudio", image: "Imagem", sticker: "Figurinha", document: "Documento", video: "Vídeo",
  };
  const cap = caption ? <span style={{ display: "block", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{caption}</span> : null;

  if (failed) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontStyle: "italic", color: "var(--text-muted)" }}>
        <AlertCircle size={12} /> {label[type] ?? type} indisponível
        <span style={{ fontSize: 10, opacity: 0.7 }}>(expirou na Meta)</span>
      </span>
    );
  }

  if (type === "image" || type === "sticker") {
    return (
      <>
        <span style={{ display: "block" }}>
          <span style={{ position: "relative", display: "inline-block", minWidth: loaded ? undefined : 120, minHeight: loaded ? undefined : 80 }}>
            {!loaded && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-elevated)", borderRadius: 8 }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></span>}
            <img src={url} alt={caption ?? "imagem"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} onClick={() => setLightbox(true)}
              style={{ maxWidth: 240, maxHeight: 300, borderRadius: 8, cursor: "zoom-in", display: "block", opacity: loaded ? 1 : 0 }} />
          </span>
          {cap}
        </span>
        {lightbox && (
          <div onClick={() => setLightbox(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
            <img src={url} alt={caption ?? "imagem"} style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8, objectFit: "contain" }} />
            <a href={url} download onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 18, right: 18, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", color: "#fff", padding: "8px 14px", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
              <Download size={14} /> Baixar
            </a>
          </div>
        )}
      </>
    );
  }
  if (type === "audio") {
    return <audio controls preload="metadata" src={url} onError={() => setFailed(true)} style={{ width: 240, height: 40 }} />;
  }
  if (type === "video") {
    return (
      <span style={{ display: "block" }}>
        <video controls preload="metadata" src={url} onError={() => setFailed(true)} style={{ maxWidth: 260, maxHeight: 320, borderRadius: 8, display: "block" }} />
        {cap}
      </span>
    );
  }
  if (type === "document") {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", textDecoration: "none", maxWidth: 240 }}>
        <FileText size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{filename || caption || "Documento"}</span>
          <span style={{ fontSize: 11, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 3 }}><Download size={10} /> Abrir</span>
        </span>
      </a>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontStyle: "italic", color: "var(--text-secondary)" }}>
      {icon[type]} {label[type] ?? type}
    </span>
  );
}
