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
export const PORTAL_TOQUE_CSS = `
/* ── Acabamento de toque ───────────────────────────────────────────────────
   Detalhes que ninguém nomeia mas todo mundo sente: sem eles o portal parece
   um site aberto no navegador; com eles, parece aplicativo. */

/* Campo com fonte menor que 16px faz o iOS dar zoom na página inteira quando a
   pessoa toca para digitar — e ela tem que desfazer o zoom na mão depois.
   "!important" porque os tamanhos estão em style inline, que vence folha.
   "select" fica de fora: no iOS ele abre seletor, não dá zoom, e aumentar a
   fonte só apertaria o cabeçalho. */
@media(max-width:1023px){
  input:not([type="file"]):not([type="checkbox"]):not([type="radio"]),textarea{font-size:16px!important}
}
/* O quadrado cinza que pisca no toque entrega que é página, não app. */
button,[role="button"],a,input,textarea,select{-webkit-tap-highlight-color:transparent}
button,[role="button"]{touch-action:manipulation}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
/* Sem isto, arrastar o fim de uma lista puxa a página inteira junto. */
body{overscroll-behavior-y:contain}
/* Barra de cima SÓLIDA no celular.
   O vidro (82% + desfoque) deixa o conteúdo passar por trás e, numa tela de
   telefone, isso vira texto sobre texto: o cartão que rola aparece através do
   título. No desktop sobra espaço e o efeito não atrapalha, então fica.
   ".ptop.ptop" porque cada página declara o próprio ".ptop" DEPOIS deste
   bloco, e media query não soma especificidade. */
@media(max-width:1023px){
  .ptop.ptop, .pbarra-solida{
    background:var(--p-bg);
    backdrop-filter:none;-webkit-backdrop-filter:none;
  }
}
/* Foco por teclado visível — e só por teclado, não a cada toque. */
:focus-visible{outline:2px solid var(--p-accent);outline-offset:2px;border-radius:6px}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}
`;

export const PORTAL_ACABAMENTO_CSS = `
/* ── Acabamento ────────────────────────────────────────────────────────────
   O celular ganhou entrada com mola, sombra e barra de vidro; o desktop ficou
   estático. Aqui o desktop alcança — sem virar outra coisa.

   Três princípios:
   · movimento só na ENTRADA (nada reage a scroll: a página já nasce lida);
   · hover atrás de (hover:hover) — no toque, hover "cola" e fica preso aceso;
   · mesma curva do mobile, cubic-bezier(.22,1,.36,1), pra parecer um produto só.
   O bloco de prefers-reduced-motion do TOQUE_CSS zera tudo isto com !important. */

@keyframes pfSobe{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* Entrada dos painéis, escalonada. O atraso PARA no 6º: além disso a pessoa
   está esperando a página, não apreciando a animação. */
/* Sem fill-mode pelo mesmo motivo da barra: nada pode ficar invisível
   esperando uma animação que talvez não rode. */
.p-panel{animation:pfSobe .42s cubic-bezier(.22,1,.36,1)}
.p-panel:nth-of-type(2){animation-delay:.05s}
.p-panel:nth-of-type(3){animation-delay:.10s}
.p-panel:nth-of-type(4){animation-delay:.15s}
.p-panel:nth-of-type(5){animation-delay:.20s}
.p-panel:nth-of-type(n+6){animation-delay:.24s}

/* Trocar o tema sem piscar. Só cor — animar layout custa quadro. */
body,.p-panel,.p-metric,.p-table tbody td,.p-phead{
  transition:background-color .22s ease,border-color .22s ease,color .22s ease}

/* Sombra com o tom do accent em vez de cinza puro: a peça parece pousada na
   página, não colada por cima dela. */
.p-panel{box-shadow:
  0 1px 2px color-mix(in srgb,var(--p-accent) 7%,rgba(16,19,28,.05)),
  0 14px 32px color-mix(in srgb,var(--p-accent) 5%,rgba(16,19,28,.07))}
html[data-pt="dark"] .p-panel{box-shadow:0 14px 34px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.055)}

/* ── Só onde existe ponteiro de verdade ─────────────────────────────────── */
@media(hover:hover) and (pointer:fine){
  .p-panel{transition:background-color .22s ease,border-color .22s ease,color .22s ease,box-shadow .24s ease,transform .24s cubic-bezier(.22,1,.36,1)}
  .p-panel:hover{transform:translateY(-2px);
    box-shadow:
      0 2px 4px color-mix(in srgb,var(--p-accent) 9%,rgba(16,19,28,.06)),
      0 22px 46px color-mix(in srgb,var(--p-accent) 8%,rgba(16,19,28,.10))}
  html[data-pt="dark"] .p-panel:hover{box-shadow:0 22px 48px rgba(0,0,0,.55)}

  /* Linha da tabela: no desktop a pessoa percorre com o olho seguindo o mouse.
     Sem realce, ela perde a linha em tabela larga. */
  .p-table tbody tr{transition:background-color .14s ease}
  .p-table tbody tr:hover{background:var(--p-raise)}

  /* Cada métrica é uma leitura; realçar a que está sob o cursor ajuda a comparar. */
  .p-metric{transition:background-color .16s ease}
  .p-metric:hover{background:var(--p-raise)}
}

/* ── Barras (.p-track) ─────────────────────────────────────────────────────
   Eram largura fixa, paradas. Ganham duas coisas:

   1. ENTRADA: revela da esquerda pra direita com clip-path. Usei clip-path em
      vez de animar a largura ou scaleX — largura de 0 precisaria saber o alvo
      (que vem inline, por peça) e scaleX esmagaria o raio de 5px numa barra de
      7px de altura. clip-path revela sem deformar nada.

   2. BRILHO CONTÍNUO: um reflexo atravessa a parte preenchida, em laço. É o que
      chama o olho para o número que importa. Só transform — o navegador resolve
      na GPU e não recalcula layout a cada quadro.

   A barra vazia não brilha (:not([style*="width: 0"])): reflexo em barra zerada
   sugere movimento onde não há dado. */
.p-track{position:relative}
.p-track>span{
  /* SEM fill-mode de propósito: com "both", o estado ANTES de rodar é
     clip-path:inset(0 100% 0 0) — barra invisível. Vi acontecer. Assim o
     natural é visível e a animação só revela enquanto roda. */
  animation:pfBarra .75s cubic-bezier(.22,1,.36,1);
  position:relative;overflow:hidden}
.p-track>span::after{
  content:"";position:absolute;inset:0;
  background:linear-gradient(100deg,transparent 28%,rgba(255,255,255,.72) 50%,transparent 72%);
  transform:translateX(-100%);
  animation:pfBrilho 2.6s ease-in-out .75s infinite}
html[data-pt="dark"] .p-track>span::after{
  background:linear-gradient(100deg,transparent 28%,rgba(255,255,255,.38) 50%,transparent 72%)}
@keyframes pfBarra{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
/* -100% → 100% percorre a barra INTEIRA e para. Antes ia a 220%: o brilho
   saía da peça em ~1/4 do caminho e o resto do ciclo era tempo morto. */
@keyframes pfBrilho{0%{transform:translateX(-100%)}55%,100%{transform:translateX(100%)}}

/* Números grandes com risco de "pular" enquanto carregam. */
.p-metric .v{font-variant-numeric:tabular-nums}

/* Tabela larga: a sombra avisa que há mais coisa para o lado — uma barra de
   rolagem fina no desktop passa despercebida. */
.p-scroll{
  background:
    linear-gradient(to right,var(--p-surface) 30%,transparent),
    linear-gradient(to right,transparent,var(--p-surface) 70%) 100% 0,
    radial-gradient(farthest-side at 0 50%,rgba(16,19,28,.12),transparent),
    radial-gradient(farthest-side at 100% 50%,rgba(16,19,28,.12),transparent) 100% 0;
  background-repeat:no-repeat;background-size:36px 100%,36px 100%,14px 100%,14px 100%;
  background-attachment:local,local,scroll,scroll}
`;

export const PORTAL_UI_CSS = `
/* Sem limite de largura, por decisão do cliente: ele quer o painel ocupando a
   tela inteira. (Foi testado com max-width 1240 centrado e ele preferiu assim.) */
.p-wrap{padding:20px 26px 64px;display:flex;flex-direction:column;gap:16px}
.tnum{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.p-eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--p-muted)}
/* Superfícies abertas: sem borda-caixa em volta; definidas por tom + sombra suave. */
.p-panel{background:var(--p-surface);border-radius:16px;box-shadow:0 1px 3px rgba(16,19,28,.05),0 16px 36px rgba(16,19,28,.06);overflow:hidden}
html[data-pt="dark"] .p-panel{box-shadow:0 14px 34px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.055)}
.p-phead{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--p-border)}
.p-phead h2{font-size:13.5px;font-weight:700;margin:0;letter-spacing:-.01em;color:var(--p-text)}
.p-phead .hint{color:var(--p-muted);opacity:.85;font-size:11.5px;margin-left:auto}
.p-metrics{display:grid;grid-template-columns:repeat(4,1fr)}
.p-metrics.tres{grid-template-columns:repeat(3,1fr)}
.p-metric{padding:16px 18px;border-left:1px solid var(--p-border);min-width:0}
.p-metric:first-child{border-left:none}
.p-metric .k{font-size:11px;font-weight:600;color:var(--p-muted)}
.p-metric .v{font-size:clamp(19px,5.4vw,26px);font-weight:750;letter-spacing:-.03em;margin-top:7px;line-height:1.1;color:var(--p-text);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
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

/* ── Card de orçamento (lista "Enviados") ────────────────────────────────────
   Estava quebrado no celular: o selo "Montado — não enviado" é longo e passava
   POR CIMA do valor, que saía cortado ("$ 2.227,00"). O valor tinha
   white-space:nowrap SEM flex-shrink:0 — espremido a zero pelo flex, o texto
   transbordava.

   Mora aqui, e nao num <style> dentro do componente, porque .p-wrap e flex
   column: uma tag <style> renderizada ali dentro vira ITEM do flex e estica o
   layout - foi como a primeira tentativa de conserto quebrou a tela inteira.
   (Sem crases neste comentario: o CSS vive dentro de um template literal.) */
/* flex:0 0 auto — a altura do card é a do CONTEUDO, e nenhum pai consegue
   estica-lo. Defensivo de proposito: o card apareceu esticado ate o fim da
   tela num print e nao foi possivel reproduzir aqui (este Mac nao roda
   browser headless), entao a protecao vale por construcao. */
.qcard{display:flex;gap:13px;align-items:flex-start;flex:0 0 auto;background:var(--p-surface);border:1px solid var(--p-border);border-radius:13px;padding:13px 14px}
.qic{width:38px;height:38px;border-radius:10px;flex-shrink:0;background:var(--p-accent-soft);color:var(--p-accent);display:flex;align-items:center;justify-content:center}
.qmain{min-width:0;flex:1}
.qlinha1{display:flex;align-items:baseline;gap:10px}
.qnum{font-size:14px;color:var(--p-text);flex-shrink:0}
.qval{font-size:15px;color:var(--p-text);white-space:nowrap;flex-shrink:0;margin-left:auto}
.qlead{font-size:12.5px;color:var(--p-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qlinha3{display:flex;align-items:center;gap:8px;margin-top:9px}
.qacts{display:flex;gap:6px;flex-shrink:0;margin-left:auto}
.qbtn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;border:1px solid var(--p-border);background:var(--p-bg);color:var(--p-muted);text-decoration:none;cursor:pointer}
.qbtn:hover{color:var(--p-text);border-color:var(--p-accent)}
/* o selo trunca por último, depois de o resto ter o seu espaço */
.qpill{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:560px){.qcard{padding:12px;gap:11px}.qic{width:34px;height:34px;border-radius:9px}.qbtn{width:38px;height:38px}}

${PORTAL_ACABAMENTO_CSS}
${PORTAL_TOQUE_CSS}
@media(max-width:820px){.p-metrics{grid-template-columns:repeat(2,1fr)}.p-metric:nth-child(3){border-left:none}
.p-metrics.tres{grid-template-columns:repeat(2,1fr)}
.p-metrics.tres>.p-metric:nth-child(3){grid-column:1/-1;border-left:none;border-top:1px solid var(--p-border)}
.p-metric{padding:14px 16px}.p-split{grid-template-columns:1fr}.p-split>div+div{border-left:none;border-top:1px solid var(--p-border)}.p-wrap{padding:16px 14px 64px}}
`;

// Script inline (anti-flash): define data-pt no <html> a partir do localStorage,
// caindo no modo da agência (auto = segue o aparelho).
export function themeInitScript(token: string, defaultMode: string): string {
  return `(function(){try{var k='pt-${token}';var m=localStorage.getItem(k)||'${defaultMode}';if(m==='auto'){m=(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-pt',m);}catch(e){}})();`;
}
