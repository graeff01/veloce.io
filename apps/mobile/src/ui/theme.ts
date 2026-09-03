// ── Paleta do portal, portada 1:1 para React Native ───────────────────────────
// PORTE FIEL de lib/portal-theme.ts. Os hexadecimais são os MESMOS do web, de
// propósito: o cliente já usa esta interface todo dia, e divergir de cor é
// divergir de produto.
//
// A cor da MARCA continua vindo do banco (ClientPortal.accentColor → /me → brand),
// exatamente como no PWA — cada cliente com a sua. Os neutros, as cores do chat e
// as semânticas acompanham o modo claro/escuro.
//
// Se lib/portal-theme.ts mudar, este arquivo muda junto.

import type { Brand } from "../core/contracts";

export interface Theme {
  // Neutros e marca (espelham --p-*)
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  // Superfície elevada e linha forte (--p-raise / --p-line-strong)
  raise: string;
  lineStrong: string;
  // Semânticas, separadas do accent da marca (--p-good / --p-warn / --p-crit)
  good: string;
  goodSoft: string;
  warn: string;
  warnSoft: string;
  crit: string;
  critSoft: string;
  // CHAT: o portal usa a paleta do WhatsApp aqui, não os neutros (--wa-*)
  waChat: string;
  waIn: string;
  waText: string;
  waMuted: string;
  waDivider: string;
  dark: boolean;
}

/** Verde de "aguardando resposta" e dos badges. Fixo no portal, não deriva da marca. */
export const VERDE_ESPERA = "#1FA855";
/** Azul do tick de LIDO, sobre o balão da marca. */
export const AZUL_LIDO = "#9BE1FF";

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Aceita a cor da marca só se for hex válido — nunca injeta string arbitrária. */
export function safeAccent(input: string | null | undefined, fallback = "#1E66F5"): string {
  const rgb = hexToRgb((input ?? "").trim());
  return rgb ? `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}` : fallback;
}

/** rgba a partir do accent, para fundos suaves (equivale a color-mix do CSS). */
export function accentAlpha(accent: string, alpha: number): string {
  const rgb = hexToRgb(accent) ?? [30, 102, 245];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function buildTheme(brand: Brand | null, systemDark: boolean): Theme {
  // Mesmo azul padrão do web quando o cliente não configurou cor.
  const rgb = hexToRgb(brand?.accentColor ?? "") ?? [30, 102, 245];
  const accent = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const onAccent = luminance(rgb) > 0.5 ? "#0b0d12" : "#ffffff"; // guard de contraste
  const accentSoft = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`;

  const mode = brand?.mode ?? "light";
  const dark = mode === "dark" || (mode === "auto" && systemDark);

  const neutros = dark
    ? { bg: "#0a0c10", surface: "#14171d", border: "#242832", text: "#eef1f6", muted: "#8b93a3" }
    : { bg: "#f5f6f9", surface: "#ffffff", border: "#e6e8ee", text: "#0f1218", muted: "#697086" };

  const extras = dark
    ? {
        raise: "#1b1f27", lineStrong: "#2e333f",
        good: "#3dd07e", goodSoft: "#12241a",
        warn: "#e0a044", warnSoft: "#2a2113",
        crit: "#f0655c", critSoft: "#2a1615",
      }
    : {
        raise: "#f4f5f8", lineStrong: "#d7dae2",
        good: "#12a150", goodSoft: "#e6f6ec",
        warn: "#c77714", warnSoft: "#fbf0df",
        crit: "#d8433b", critSoft: "#fbe9e8",
      };

  const wa = dark
    ? { waChat: "#0b141a", waIn: "#202c33", waText: "#e9edef", waMuted: "#8696a0", waDivider: "#182229" }
    : { waChat: "#efeae2", waIn: "#ffffff", waText: "#111b21", waMuted: "#667781", waDivider: "#e1dacf" };

  return { ...neutros, ...extras, ...wa, accent, accentSoft, onAccent, dark };
}

/**
 * Cor do avatar derivada do NOME — igual ao `avatarColor` do portal. O mesmo lead
 * mantém a mesma cor nos dois clientes, o que ajuda o reconhecimento visual.
 */
export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 42%, 52%)`;
}

/** Etapas do funil — rótulos e cores iguais aos do portal-conversations.tsx. */
export const STAGE: Record<string, { label: string; color: string }> = {
  recebido: { label: "Recebido", color: "#697086" },
  respondido: { label: "Respondido", color: "#2563EB" },
  qualificado: { label: "Qualificado", color: "#2563EB" },
  negociacao: { label: "Negociação", color: "#7C3AED" },
  convertido: { label: "Convertido", color: "#16A34A" },
  perdido: { label: "Perdido", color: "#d6453d" },
};

/** Compatibilidade com o código existente. */
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STAGE).map(([k, v]) => [k, v.label]),
);
