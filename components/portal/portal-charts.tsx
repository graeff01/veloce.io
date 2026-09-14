"use client";

import { useEffect, useRef } from "react";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#3358ff";
}

// Quem pediu ao sistema para reduzir animação não recebe movimento nenhum.
function prefereParado(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Laço de animação com freio: para quando a aba sai de foco e quando o gráfico
// sai da tela. Sem isso, um gráfico animado drena bateria de celular à toa.
function usarLaco(
  alvo: React.RefObject<HTMLCanvasElement | null>,
  quadro: (t: number) => void,
  ligado: boolean,
) {
  useEffect(() => {
    const cv = alvo.current;
    if (!cv) return;
    if (!ligado || prefereParado()) { quadro(0); return; }

    let raf = 0, visivel = true, naTela = true;
    const rodando = () => visivel && naTela;

    const passo = (t: number) => { quadro(t); raf = requestAnimationFrame(passo); };
    const acordar = () => { if (rodando() && !raf) raf = requestAnimationFrame(passo); };
    const dormir = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    const aba = () => { visivel = document.visibilityState === "visible"; rodando() ? acordar() : dormir(); };
    document.addEventListener("visibilitychange", aba);

    const io = new IntersectionObserver(([e]) => { naTela = e.isIntersecting; rodando() ? acordar() : dormir(); }, { threshold: 0.01 });
    io.observe(cv);

    acordar();
    return () => { dormir(); document.removeEventListener("visibilitychange", aba); io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado]);
}

// Gráfico de área (ex.: leads por dia). Theme-aware: redesenha ao trocar tema/resize.
// `animado` acende um pulso que percorre a linha continuamente.
// `rotuloTopo` é TEXTO, não função: este componente roda no cliente e a página
// que o usa roda no servidor — função não atravessa essa fronteira.
export function AreaChart({ points, height = 150, animado = false, rotuloTopo, descricao }: {
  points: number[];
  height?: number;
  animado?: boolean;
  rotuloTopo?: string;
  descricao?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const desenhar = useRef<(t: number) => void>(() => {});

  desenhar.current = (t: number) => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth;
    if (!w) return;
    const acc = cssVar("--p-accent"), line = cssVar("--p-border"), mudo = cssVar("--p-muted");
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(height * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(height * dpr);
    }
    const x = cv.getContext("2d"); if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, height);

    const pts = points.length ? points : [0, 0];
    // padX generoso à direita: o anel que pulsa na ponta tem 15px de raio e
    // era cortado pela borda do painel.
    const padT = 16, padB = 6, padX = 13;
    const mn = 0, mx = Math.max(1, ...pts) * 1.15;
    const X = (i: number) => padX + (i / Math.max(1, pts.length - 1)) * (w - 2 * padX);
    const Y = (v: number) => height - padB - ((v - mn) / (mx - mn)) * (height - padT - padB);

    for (let g = 0; g <= 3; g++) {
      const yy = padT + (g / 3) * (height - padT - padB);
      x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy);
      x.strokeStyle = line; x.lineWidth = 1; x.globalAlpha = 0.6; x.stroke(); x.globalAlpha = 1;
    }

    const path = () => { x.beginPath(); pts.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); };

    path(); x.lineTo(X(pts.length - 1), height - padB); x.lineTo(X(0), height - padB); x.closePath();
    const grad = x.createLinearGradient(0, padT, 0, height - padB);
    grad.addColorStop(0, acc + "2e"); grad.addColorStop(1, acc + "00");
    x.fillStyle = grad; x.fill();

    path(); x.strokeStyle = acc; x.lineWidth = 2; x.lineJoin = "round"; x.stroke();

    // Pulso que percorre a linha. Um traço tracejado curtíssimo com o
    // deslocamento andando no tempo: um único brilho viajando do começo ao fim.
    if (t > 0) {
      let comp = 0;
      for (let i = 1; i < pts.length; i++) comp += Math.hypot(X(i) - X(i - 1), Y(pts[i]) - Y(pts[i - 1]));
      if (comp > 0) {
        const u = (t / 3400) % 1;
        x.save();
        x.setLineDash([comp * 0.09, comp * 0.91]);
        x.lineDashOffset = -u * comp;
        x.shadowColor = acc; x.shadowBlur = 10;
        path(); x.strokeStyle = acc; x.lineWidth = 3; x.lineCap = "round"; x.globalAlpha = 0.75; x.stroke();
        x.restore();
      }
    }

    // Ponta: um ponto fixo e um anel que abre e some, como um sinal de "ao vivo".
    const lx = X(pts.length - 1), ly = Y(pts[pts.length - 1]);
    if (t > 0) {
      const f = (t / 1600) % 1;
      x.save(); x.globalAlpha = (1 - f) * 0.45;
      x.beginPath(); x.arc(lx, ly, 4 + f * 11, 0, Math.PI * 2);
      x.strokeStyle = acc; x.lineWidth = 2; x.stroke(); x.restore();
    }
    x.beginPath(); x.arc(lx, ly, 6, 0, Math.PI * 2); x.strokeStyle = acc + "55"; x.lineWidth = 2; x.stroke();
    x.beginPath(); x.arc(lx, ly, 3.2, 0, Math.PI * 2); x.fillStyle = acc; x.fill();

    // O pico com nome: sem ele o desenho sobe e desce sem dizer quanto.
    if (rotuloTopo) {
      x.font = "600 10.5px system-ui, -apple-system, sans-serif";
      x.fillStyle = mudo; x.textBaseline = "top";
      x.fillText(rotuloTopo, 0, 1);
    }
  };

  usarLaco(ref, (t) => desenhar.current(t), animado);

  useEffect(() => {
    const redesenhar = () => desenhar.current(0);
    redesenhar();
    window.addEventListener("resize", redesenhar);
    const mo = new MutationObserver(redesenhar);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pt"] });
    return () => { window.removeEventListener("resize", redesenhar); mo.disconnect(); };
  }, [points, height, animado, rotuloTopo, descricao]);

  return <canvas ref={ref} style={{ width: "100%", height, display: "block" }} role="img" aria-label={descricao ?? "Gráfico de evolução"} />;
}

// Mini gráfico (sparkline) dentro de uma célula de métrica.
export function Sparkline({ points, colorVar = "--p-accent", height = 30, animado = false, descricao }: {
  points: number[]; colorVar?: string; height?: number; animado?: boolean; descricao?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const desenhar = useRef<(t: number) => void>(() => {});

  desenhar.current = (t: number) => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth; if (!w) return;
    const c = cssVar(colorVar);
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(height * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(height * dpr);
    }
    const x = cv.getContext("2d"); if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, height);

    const pts = points.length ? points : [0, 0];
    const mn = Math.min(...pts), mx = Math.max(...pts), pad = 3;
    const X = (i: number) => (i / Math.max(1, pts.length - 1)) * w;
    const Y = (v: number) => height - pad - ((v - mn) / (mx - mn || 1)) * (height - 2 * pad);
    const path = () => { x.beginPath(); pts.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); };

    path(); x.strokeStyle = c; x.lineWidth = 1.6; x.lineJoin = "round"; x.stroke();
    x.lineTo(w, height); x.lineTo(0, height); x.closePath();
    const grad = x.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, c + "33"); grad.addColorStop(1, c + "00");
    x.fillStyle = grad; x.fill();

    if (t > 0) {
      let comp = 0;
      for (let i = 1; i < pts.length; i++) comp += Math.hypot(X(i) - X(i - 1), Y(pts[i]) - Y(pts[i - 1]));
      if (comp > 0) {
        const u = (t / 3400) % 1;
        x.save();
        x.setLineDash([comp * 0.09, comp * 0.91]);
        x.lineDashOffset = -u * comp;
        x.shadowColor = c; x.shadowBlur = 6;
        path(); x.strokeStyle = c; x.lineWidth = 2.4; x.lineCap = "round"; x.globalAlpha = 0.7; x.stroke();
        x.restore();
      }
    }

    x.beginPath(); x.arc(X(pts.length - 1), Y(pts[pts.length - 1]), 2.2, 0, Math.PI * 2); x.fillStyle = c; x.fill();
  };

  usarLaco(ref, (t) => desenhar.current(t), animado);

  useEffect(() => {
    const redesenhar = () => desenhar.current(0);
    redesenhar();
    window.addEventListener("resize", redesenhar);
    const mo = new MutationObserver(redesenhar);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pt"] });
    return () => { window.removeEventListener("resize", redesenhar); mo.disconnect(); };
  }, [points, colorVar, height, animado, descricao]);

  return <canvas ref={ref} style={{ width: "100%", height, display: "block" }} role="img" aria-label={descricao ?? "Mini gráfico de evolução"} />;
}
