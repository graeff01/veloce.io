"use client";

import { useEffect, useRef } from "react";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#3358ff";
}

// Gráfico de área (ex.: leads por dia). Theme-aware: redesenha ao trocar tema/resize.
export function AreaChart({ points, height = 150 }: { points: number[]; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const w = cv.clientWidth;
      if (!w) return;
      const acc = cssVar("--p-accent"), line = cssVar("--p-border");
      const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr; cv.height = height * dpr;
      const x = cv.getContext("2d"); if (!x) return;
      x.scale(dpr, dpr); x.clearRect(0, 0, w, height);
      const pts = points.length ? points : [0, 0];
      const padT = 10, padB = 6, padX = 2;
      const mn = 0, mx = Math.max(1, ...pts) * 1.15;
      const X = (i: number) => padX + (i / Math.max(1, pts.length - 1)) * (w - 2 * padX);
      const Y = (v: number) => height - padB - ((v - mn) / (mx - mn)) * (height - padT - padB);
      for (let g = 0; g <= 3; g++) { const yy = padT + (g / 3) * (height - padT - padB); x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy); x.strokeStyle = line; x.lineWidth = 1; x.globalAlpha = 0.6; x.stroke(); x.globalAlpha = 1; }
      const path = () => { x.beginPath(); pts.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); };
      path(); x.lineTo(X(pts.length - 1), height - padB); x.lineTo(X(0), height - padB); x.closePath();
      const grad = x.createLinearGradient(0, padT, 0, height - padB); grad.addColorStop(0, acc + "2e"); grad.addColorStop(1, acc + "00"); x.fillStyle = grad; x.fill();
      path(); x.strokeStyle = acc; x.lineWidth = 2; x.lineJoin = "round"; x.stroke();
      const lx = X(pts.length - 1), ly = Y(pts[pts.length - 1]);
      x.beginPath(); x.arc(lx, ly, 3.2, 0, 7); x.fillStyle = acc; x.fill();
      x.beginPath(); x.arc(lx, ly, 6, 0, 7); x.strokeStyle = acc + "55"; x.lineWidth = 2; x.stroke();
    };
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pt"] });
    return () => { window.removeEventListener("resize", onResize); mo.disconnect(); };
  }, [points, height]);
  return <canvas ref={ref} style={{ width: "100%", height, display: "block" }} />;
}

// Mini gráfico (sparkline) dentro de uma célula de métrica.
export function Sparkline({ points, colorVar = "--p-accent", height = 30 }: { points: number[]; colorVar?: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const w = cv.clientWidth; if (!w) return;
      const c = cssVar(colorVar);
      const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr; cv.height = height * dpr;
      const x = cv.getContext("2d"); if (!x) return;
      x.scale(dpr, dpr); x.clearRect(0, 0, w, height);
      const pts = points.length ? points : [0, 0];
      const mn = Math.min(...pts), mx = Math.max(...pts), pad = 3;
      const X = (i: number) => (i / Math.max(1, pts.length - 1)) * w;
      const Y = (v: number) => height - pad - ((v - mn) / (mx - mn || 1)) * (height - 2 * pad);
      x.beginPath(); pts.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))));
      x.strokeStyle = c; x.lineWidth = 1.6; x.lineJoin = "round"; x.stroke();
      x.lineTo(w, height); x.lineTo(0, height); x.closePath();
      const grad = x.createLinearGradient(0, 0, 0, height); grad.addColorStop(0, c + "33"); grad.addColorStop(1, c + "00"); x.fillStyle = grad; x.fill();
      x.beginPath(); x.arc(X(pts.length - 1), Y(pts[pts.length - 1]), 2.2, 0, 7); x.fillStyle = c; x.fill();
    };
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pt"] });
    return () => { window.removeEventListener("resize", onResize); mo.disconnect(); };
  }, [points, colorVar, height]);
  return <canvas ref={ref} style={{ width: "100%", height, display: "block" }} />;
}
