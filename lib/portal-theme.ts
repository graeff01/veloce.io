// Deriva uma paleta completa a partir de UMA cor de marca + modo (claro/escuro).
// Garante contraste legível (luminância → texto preto/branco sobre o accent).

export interface Theme {
  bg: string; surface: string; border: string;
  text: string; muted: string;
  accent: string; accentSoft: string; onAccent: string;
}

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

export function buildTheme(accentInput: string | null, modeInput: string): Theme {
  const rgb = (accentInput && hexToRgb(accentInput)) || [30, 102, 245]; // azul padrão
  const accent = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const onAccent = luminance(rgb) > 0.5 ? "#0b0d12" : "#ffffff"; // guard de contraste
  const accentSoft = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`;
  const dark = modeInput === "dark";
  return dark
    ? { bg: "#0c0e13", surface: "#15181f", border: "#262b36", text: "#eef1f6", muted: "#9aa3b2", accent, accentSoft, onAccent }
    : { bg: "#f6f7f9", surface: "#ffffff", border: "#e8ebf0", text: "#101319", muted: "#6b7480", accent, accentSoft, onAccent };
}

// CSS com variáveis do tema. Suporta "auto" (segue o device via prefers-color-scheme).
// A página usa var(--p-bg), var(--p-text) etc.
export function themeStyle(accent: string | null, mode: string): string {
  const vars = (t: Theme) =>
    `--p-bg:${t.bg};--p-surface:${t.surface};--p-border:${t.border};--p-text:${t.text};` +
    `--p-muted:${t.muted};--p-accent:${t.accent};--p-accent-soft:${t.accentSoft};--p-on-accent:${t.onAccent};`;
  const light = buildTheme(accent, "light");
  const dark = buildTheme(accent, "dark");
  if (mode === "dark") return `:root{${vars(dark)}}`;
  if (mode === "auto") return `:root{${vars(light)}}@media(prefers-color-scheme:dark){:root{${vars(dark)}}}`;
  return `:root{${vars(light)}}`;
}

// CSS chaveável claro/escuro pelo cliente: aplica via atributo data-pt no <html>.
// Default em :root (funciona sem JS, no modo da agência). Inclui as vars --wa-* do
// WhatsApp pra o chat seguir o toggle também.
export function themeSwitchCss(accent: string | null, defaultMode: string): string {
  const vars = (t: Theme) =>
    `--p-bg:${t.bg};--p-surface:${t.surface};--p-border:${t.border};--p-text:${t.text};` +
    `--p-muted:${t.muted};--p-accent:${t.accent};--p-accent-soft:${t.accentSoft};--p-on-accent:${t.onAccent};`;
  const waLight = "--wa-chat:#efeae2;--wa-in:#ffffff;--wa-text:#111b21;--wa-muted:#667781;--wa-divider:#e1dacf;";
  const waDark = "--wa-chat:#0b141a;--wa-in:#202c33;--wa-text:#e9edef;--wa-muted:#8696a0;--wa-divider:#182229;";
  const light = buildTheme(accent, "light");
  const dark = buildTheme(accent, "dark");
  const def = defaultMode === "dark" ? `${vars(dark)}${waDark}` : `${vars(light)}${waLight}`;
  return `:root{${def}}` +
    `html[data-pt="light"]{${vars(light)}${waLight}}` +
    `html[data-pt="dark"]{${vars(dark)}${waDark}}`;
}

// Script inline (anti-flash): define data-pt no <html> a partir do localStorage,
// caindo no modo da agência (auto = segue o aparelho).
export function themeInitScript(token: string, defaultMode: string): string {
  return `(function(){try{var k='pt-${token}';var m=localStorage.getItem(k)||'${defaultMode}';if(m==='auto'){m=(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-pt',m);}catch(e){}})();`;
}
