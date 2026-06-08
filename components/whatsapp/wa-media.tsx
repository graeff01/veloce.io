"use client";

import { useState } from "react";
import { Mic, Image, FileText, Video } from "lucide-react";

// Exibe a mídia de uma WaMessage para o OPERADOR (espelhamento/auditoria).
// Baixa via proxy do servidor — nada vai para terceiros. A IA NÃO usa este
// componente; ela apenas reconhece o tipo por marcador e segue suas regras.
export function MediaContent({ clientId, msgId, type, caption }: { clientId: string; msgId: string; type: string; caption: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = `/api/clients/${clientId}/whatsapp/media/${msgId}`;

  const icon: Record<string, React.ReactNode> = {
    audio: <Mic size={12} />, image: <Image size={12} />, sticker: <Image size={12} />,
    document: <FileText size={12} />, video: <Video size={12} />,
  };
  const label: Record<string, string> = {
    audio: "Áudio", image: "Imagem", sticker: "Figurinha", document: "Documento", video: "Vídeo",
  };
  const marker = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontStyle: "italic", color: "var(--text-secondary)" }}>
      {icon[type]} {label[type] ?? type}
    </span>
  );
  if (failed) return marker;
  const cap = caption ? <span style={{ display: "block", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{caption}</span> : null;

  if (type === "image" || type === "sticker") {
    return (
      <span style={{ display: "block" }}>
        <img src={url} alt="" onError={() => setFailed(true)} onClick={() => window.open(url, "_blank")}
          style={{ maxWidth: 240, maxHeight: 300, borderRadius: 8, cursor: "zoom-in", display: "block" }} />
        {cap}
      </span>
    );
  }
  if (type === "audio") {
    return <audio controls src={url} onError={() => setFailed(true)} style={{ width: 240, height: 40 }} />;
  }
  if (type === "video") {
    return (
      <span style={{ display: "block" }}>
        <video controls src={url} onError={() => setFailed(true)} style={{ maxWidth: 260, maxHeight: 320, borderRadius: 8, display: "block" }} />
        {cap}
      </span>
    );
  }
  if (type === "document") {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
        <FileText size={14} /> {caption || "Abrir documento"}
      </a>
    );
  }
  return marker;
}
