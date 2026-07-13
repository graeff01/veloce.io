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
  // Neutros com leve viés frio (escolhidos, não cinza puro) — combinam com o accent.
  return dark
    ? { bg: "#0a0c10", surface: "#14171d", border: "#242832", text: "#eef1f6", muted: "#8b93a3", accent, accentSoft, onAccent }
    : { bg: "#f5f6f9", surface: "#ffffff", border: "#e6e8ee", text: "#0f1218", muted: "#697086", accent, accentSoft, onAccent };
}

// Tokens extras do sistema de design do portal: superfície elevada, linha forte e cores
// SEMÂNTICAS (bom/atenção/crítico) — separadas do accent da marca. Trocam com o tema.
function extraVars(dark: boolean): string {
  return dark
    ? "--p-raise:#1b1f27;--p-line-strong:#2e333f;--p-good:#3dd07e;--p-good-soft:#12241a;--p-warn:#e0a044;--p-warn-soft:#2a2113;--p-crit:#f0655c;--p-crit-soft:#2a1615;"
    : "--p-raise:#f4f5f8;--p-line-strong:#d7dae2;--p-good:#12a150;--p-good-soft:#e6f6ec;--p-warn:#c77714;--p-warn-soft:#fbf0df;--p-crit:#d8433b;--p-crit-soft:#fbe9e8;";
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
  const def = defaultMode === "dark" ? `${vars(dark)}${waDark}${extraVars(true)}` : `${vars(light)}${waLight}${extraVars(false)}`;
  return `:root{${def}}` +
    `html[data-pt="light"]{${vars(light)}${waLight}${extraVars(false)}}` +
    `html[data-pt="dark"]{${vars(dark)}${waDark}${extraVars(true)}}`;
}

// Sistema de design do portal (classes reutilizáveis): superfície ÚNICA e coesa dividida
// por linhas finas — sem blocos soltos com fundos diferentes. Referência de CRMs modernos.
export const PORTAL_UI_CSS = `
.p-wrap{max-width:1160px;margin:0 auto;padding:22px 26px 64px;display:flex;flex-direction:column;gap:18px}
.tnum{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.p-eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--p-muted)}
.p-panel{background:var(--p-surface);border:1px solid var(--p-border);border-radius:14px;box-shadow:0 1px 2px rgba(16,19,28,.04),0 8px 24px rgba(16,19,28,.05);overflow:hidden}
html[data-pt="dark"] .p-panel{box-shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.32)}
.p-phead{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--p-border)}
.p-phead h2{font-size:13.5px;font-weight:700;margin:0;letter-spacing:-.01em;color:var(--p-text)}
.p-phead .hint{color:var(--p-muted);opacity:.85;font-size:11.5px;margin-left:auto}
.p-metrics{display:grid;grid-template-columns:repeat(4,1fr)}
.p-metric{padding:16px 18px;border-left:1px solid var(--p-border);min-width:0}
.p-metric:first-child{border-left:none}
.p-metric .k{font-size:11px;font-weight:600;color:var(--p-muted)}
.p-metric .v{font-size:26px;font-weight:750;letter-spacing:-.03em;margin-top:7px;line-height:1;color:var(--p-text);font-variant-numeric:tabular-nums}
.p-metric .foot{font-size:11px;color:var(--p-muted);opacity:.85;margin-top:8px}
.p-chip{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:700;padding:2px 7px;border-radius:20px;margin-top:8px}
.p-chip.up{color:var(--p-good);background:var(--p-good-soft)}
.p-chip.down{color:var(--p-crit);background:var(--p-crit-soft)}
.p-chip.flat{color:var(--p-muted);background:var(--p-raise)}
.p-pill{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px}
.p-pill.good{color:var(--p-good);background:var(--p-good-soft)}
.p-pill.warn{color:var(--p-warn);background:var(--p-warn-soft)}
.p-pill.crit{color:var(--p-crit);background:var(--p-crit-soft)}
.p-split{display:grid;grid-template-columns:1.35fr 1fr;border-top:1px solid var(--p-border)}
.p-split>div{padding:18px;min-width:0}
.p-split>div+div{border-left:1px solid var(--p-border)}
.p-table{width:100%;border-collapse:collapse}
.p-table thead th{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--p-muted);text-align:right;padding:11px 16px;border-bottom:1px solid var(--p-border);white-space:nowrap}
.p-table thead th:first-child{text-align:left}
.p-table tbody td{padding:13px 16px;text-align:right;border-bottom:1px solid var(--p-border);white-space:nowrap;font-size:13.5px;color:var(--p-text)}
.p-table tbody td:first-child{text-align:left}
.p-table tbody tr:last-child td{border-bottom:none}
.p-scroll{overflow-x:auto}
@media(max-width:820px){.p-metrics{grid-template-columns:repeat(2,1fr)}.p-metric:nth-child(3){border-left:none}.p-split{grid-template-columns:1fr}.p-split>div+div{border-left:none;border-top:1px solid var(--p-border)}.p-wrap{padding:16px 14px 64px}}
`;

// Script inline (anti-flash): define data-pt no <html> a partir do localStorage,
// caindo no modo da agência (auto = segue o aparelho).
export function themeInitScript(token: string, defaultMode: string): string {
  return `(function(){try{var k='pt-${token}';var m=localStorage.getItem(k)||'${defaultMode}';if(m==='auto'){m=(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-pt',m);}catch(e){}})();`;
}
