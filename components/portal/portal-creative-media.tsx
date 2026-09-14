"use client";

import { useEffect, useRef, useState } from "react";

// Mídia do criativo destaque: vídeo mudo em loop quando há vídeo; senão (ou se a
// fonte da Meta falhar/expirar) cai para a imagem em alta. Sempre preenche o box.
// Miniatura da campanha. As URLs de imagem da Meta EXPIRAM; entre uma
// sincronização e outra uma peça pode virar quadrado quebrado na tela do
// cliente. Quando falha, cai no ícone — que é feio de propósito, mas honesto.
export function PortalThumb({ src, tamanho = 52 }: { src: string | null; tamanho?: number }) {
  const [quebrou, setQuebrou] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  // A imagem costuma falhar ANTES da hidratação — o HTML vem do servidor e o
  // navegador já tentou baixar. Nesse caso o React nunca dispara `onError`, e
  // sem esta conferência o quadrado quebrado fica na tela para sempre.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setQuebrou(true);
  }, [src]);

  if (!src || quebrou) return <span style={{ fontSize: tamanho / 3, opacity: 0.35 }} aria-hidden>📣</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={img} src={src} alt="" decoding="async" loading="lazy" onError={() => setQuebrou(true)}
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
}

export function PortalCreativeMedia({ videoSrc, poster }: { videoSrc: string | null; poster: string | null }) {
  const [failed, setFailed] = useState(false);
  const fill: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

  if (videoSrc && !failed) {
    return (
      <video
        src={videoSrc}
        poster={poster ?? undefined}
        autoPlay muted loop playsInline preload="metadata"
        onError={() => setFailed(true)}
        style={fill}
      />
    );
  }
  if (poster) {
    // `decoding=async` tira a decodificação do caminho de pintura — a peça é
    // grande e não pode travar a rolagem do celular enquanto abre.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" decoding="async" style={fill} />;
  }
  return <span style={{ fontSize: 34 }}>📣</span>;
}
