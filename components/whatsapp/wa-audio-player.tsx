"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, FileText } from "lucide-react";

// Player de nota de voz no estilo WhatsApp: onda + play/pause + tempo + velocidade, e a
// TRANSCRIÇÃO logo abaixo (o atendente lê sem precisar ouvir). O <audio> real toca o arquivo
// persistido (WaMedia); a onda é decorativa mas se preenche conforme o progresso — não depende
// de decodificar o áudio (funciona em qualquer navegador, inclusive iPhone).

const BAR_COUNT = 34;

// Alturas de barra estáveis por mensagem (parece uma onda real, mas é determinístico pela URL).
function bars(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    out.push(0.25 + (h % 1000) / 1000 * 0.75); // 25%–100%
  }
  return out;
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const SPEEDS = [1, 1.5, 2] as const;

export function WaAudioPlayer({ src, transcription, accent = "var(--accent)" }: {
  src: string; transcription?: string | null; accent?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const [showText, setShowText] = useState(false);
  const waveform = useMemo(() => bars(src), [src]);
  const progress = dur > 0 ? cur / dur : 0;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd = () => { setPlaying(false); setCur(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("loadedmetadata", onMeta); a.removeEventListener("durationchange", onMeta); a.removeEventListener("ended", onEnd); };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => setFailed(true)); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  return (
    <span style={{ display: "block", minWidth: 210, maxWidth: 300 }}>
      <audio ref={audioRef} src={src} preload="metadata" onError={() => setFailed(true)} style={{ display: "none" }} />
      {failed ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontStyle: "italic", color: "var(--text-muted)", fontSize: 12.5 }}>
          Áudio indisponível
        </span>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={toggle} aria-label={playing ? "Pausar" : "Tocar"}
            style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", border: "none", background: accent, color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {playing ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />}
          </button>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span onClick={seek} style={{ display: "flex", alignItems: "center", gap: 2, height: 28, cursor: "pointer" }}>
              {waveform.map((h, i) => {
                const filled = i / BAR_COUNT <= progress;
                return <span key={i} style={{ flex: 1, height: `${Math.round(h * 100)}%`, minHeight: 3, borderRadius: 2, background: filled ? accent : "var(--border)", opacity: filled ? 1 : 0.6, transition: "background .1s" }} />;
              })}
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{fmt(playing || cur > 0 ? cur : dur)}</span>
              <button onClick={cycleSpeed} style={{ fontSize: 10.5, fontWeight: 700, color: accent, background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}>{SPEEDS[speedIdx]}×</button>
            </span>
          </span>
        </span>
      )}
      {transcription && (
        <span style={{ display: "block", marginTop: 6 }}>
          {showText ? (
            <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.4, color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}><FileText size={11} /> Transcrição</span>
              <span style={{ display: "block" }}>{transcription}</span>
            </span>
          ) : (
            <button onClick={() => setShowText(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <FileText size={12} /> Ver transcrição
            </button>
          )}
        </span>
      )}
    </span>
  );
}
