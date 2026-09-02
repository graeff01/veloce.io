// ── Marca do cliente aplicada em runtime ──────────────────────────────────────
// Um único binário "Veloce" veste a identidade da loja depois do login, a partir
// de `/me → brand` (accentColor + mode já existiam no banco, em ClientPortal).
// Espelha a intenção de lib/portal-theme.ts do web, sem copiar o CSS.

import type { Brand } from "../core/contracts";

export interface Theme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  bubbleIn: string;
  bubbleOut: string;
  danger: string;
  good: string;
  dark: boolean;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Cor da marca só é aceita se for hex válido — nunca injeta string arbitrária. */
export function safeAccent(input: string | null | undefined, fallback = "#111111"): string {
  const v = (input ?? "").trim();
  return HEX.test(v) ? v : fallback;
}

/** Luminância relativa simplificada, para decidir texto claro ou escuro em cima. */
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

export function buildTheme(brand: Brand | null, systemDark: boolean): Theme {
  const accent = safeAccent(brand?.accentColor);
  const mode = brand?.mode ?? "light";
  const dark = mode === "dark" || (mode === "auto" && systemDark);

  return dark
    ? {
        bg: "#0E1116", surface: "#161B22", text: "#E6EDF3", muted: "#8B949E",
        border: "#272E36", accent, accentText: isLight(accent) ? "#0E1116" : "#FFFFFF",
        bubbleIn: "#1C232B", bubbleOut: accent, danger: "#F85149", good: "#3FB950", dark,
      }
    : {
        bg: "#F6F7F9", surface: "#FFFFFF", text: "#101319", muted: "#6B7480",
        border: "#E4E7EB", accent, accentText: isLight(accent) ? "#101319" : "#FFFFFF",
        bubbleIn: "#FFFFFF", bubbleOut: accent, danger: "#D6453D", good: "#16A34A", dark,
      };
}

/** Rótulos das etapas do funil — os mesmos do portal web. */
export const STAGE_LABEL: Record<string, string> = {
  recebido: "Recebido", respondido: "Respondido", qualificado: "Qualificado",
  negociacao: "Negociação", convertido: "Convertido", perdido: "Perdido",
};
