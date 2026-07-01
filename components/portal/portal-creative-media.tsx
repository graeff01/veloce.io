"use client";

import { useState } from "react";

// Mídia do criativo destaque: vídeo mudo em loop quando há vídeo; senão (ou se a
// fonte da Meta falhar/expirar) cai para a imagem em alta. Sempre preenche o box.
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
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" style={fill} />;
  }
  return <span style={{ fontSize: 34 }}>📣</span>;
}
