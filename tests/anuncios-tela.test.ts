import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { melhorImagem } from "../lib/meta-sync";

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

// ── A imagem do anúncio ──────────────────────────────────────────────────────
// `thumbnail_url` vem 64×64 por padrão (documentado pela Meta). Esticada na
// largura do celular, vira o borrão que a JR e a Boqueirão viram na tela.

const SEM_SPEC = { imageUrl: null, picture: null };

test("a peça publicada ganha de tudo", () => {
  const escolha = melhorImagem({ imageUrl: "https://cdn/peca-publicada.jpg", picture: null },
    { image_url: "https://cdn/biblioteca.jpg", thumbnail_url: "https://cdn/thumb.jpg" }, new Map());
  assert.equal(escolha, "https://cdn/peca-publicada.jpg");
});

test("a prévia do spec perde para a imagem cheia da biblioteca", () => {
  // `picture` costuma ser uma prévia reduzida. Antes ela era tratada como
  // equivalente à imagem cheia — e era isso que a tela acabava mostrando.
  const escolha = melhorImagem({ imageUrl: null, picture: "https://cdn/previa.jpg" },
    { image_url: "https://cdn/biblioteca.jpg" }, new Map());
  assert.equal(escolha, "https://cdn/biblioteca.jpg");
});

test("a prévia ainda ganha da thumbnail", () => {
  const escolha = melhorImagem({ imageUrl: null, picture: "https://cdn/previa.jpg" },
    { thumbnail_url: "https://cdn/thumb.jpg" }, new Map());
  assert.equal(escolha, "https://cdn/previa.jpg");
});

test("sem spec, vale a imagem da biblioteca", () => {
  const escolha = melhorImagem(SEM_SPEC,
    { image_url: "https://cdn/biblioteca.jpg", thumbnail_url: "https://cdn/thumb.jpg" }, new Map());
  assert.equal(escolha, "https://cdn/biblioteca.jpg");
});

test("criativo que só guarda o hash é resolvido pela biblioteca", () => {
  // Este é o caso comum em anúncio de engajamento com Click-to-WhatsApp, e é
  // por ele que a tela caía na thumbnail minúscula.
  const escolha = melhorImagem(SEM_SPEC,
    { image_hash: "abc123", thumbnail_url: "https://cdn/thumb.jpg" },
    new Map([["abc123", "https://cdn/original-1080.jpg"]]));
  assert.equal(escolha, "https://cdn/original-1080.jpg");
});

test("a thumbnail é o último recurso, nunca o primeiro", () => {
  const escolha = melhorImagem(SEM_SPEC, { thumbnail_url: "https://cdn/thumb.jpg" }, new Map());
  assert.equal(escolha, "https://cdn/thumb.jpg");
});

test("sem nenhuma fonte, devolve nulo em vez de inventar", () => {
  assert.equal(melhorImagem(SEM_SPEC, {}, new Map()), null);
});

test("a thumbnail é pedida grande, não nos 64px do padrão", () => {
  const fonte = ler("lib", "meta-sync.ts");
  assert.match(fonte, /thumbnail_width=1080&thumbnail_height=1080/);
});

test("buscar imagem nunca põe a atribuição em risco", () => {
  // A chamada que carrega object_story_spec é a que extrai o número CTWA — a
  // base da atribuição da JR. Campos novos pendurados nela derrubariam a
  // atribuição inteira por uma questão de nitidez. Por isso a imagem em alta
  // vem numa chamada separada e best-effort.
  const fonte = ler("lib", "meta-sync.ts");
  const chamadaCTWA = fonte.slice(fonte.indexOf("adcreatives?fields=${CR_BASE}"), fonte.indexOf("const waByCreative"));
  assert.ok(!/image_url|image_hash|thumbnail_width/.test(chamadaCTWA),
    "a chamada do object_story_spec não pode carregar campos de imagem");

  const bloco = fonte.slice(fonte.indexOf("Imagem em ALTA"), fonte.indexOf("// 2) Insights"));
  assert.match(bloco, /try \{/, "a busca de imagem tem que ser best-effort");
  assert.match(bloco, /catch/);
});

// ── O layout que quebrava ────────────────────────────────────────────────────
// `style` inline vence media query. Forçar 3 colunas assim deixava o celular
// com três colunas espremidas: "R$ 551,68" saía por cima do "63" ao lado.

test("nenhuma tela do portal força colunas por style inline", () => {
  const telas = ["anuncios", "objecoes"].map((t) => ["app", "r", "[token]", t, "page.tsx"]);
  for (const t of telas) {
    const fonte = ler(...t);
    assert.ok(!/className="p-metrics"[^>]*gridTemplateColumns/.test(fonte),
      `${t.join("/")} força colunas inline — a media query do celular não consegue vencer`);
  }
});

test("três métricas viram duas mais uma inteira no celular", () => {
  const css = ler("lib", "portal-theme.ts");
  assert.match(css, /\.p-metrics\.tres\{grid-template-columns:repeat\(3,1fr\)\}/);
  const celular = css.slice(css.indexOf("@media(max-width:820px)"));
  assert.match(celular, /\.p-metrics\.tres\{grid-template-columns:repeat\(2,1fr\)\}/);
  assert.match(celular, /\.p-metrics\.tres>\.p-metric:nth-child\(3\)\{grid-column:1\/-1/);
});

test("o número da métrica encolhe junto com a coluna", () => {
  const css = ler("lib", "portal-theme.ts");
  assert.match(css, /\.p-metric \.v\{font-size:clamp\(/,
    "tamanho fixo em coluna estreita é o que fazia o valor invadir a vizinha");
});

// ── A animação ───────────────────────────────────────────────────────────────

test("o gráfico de anúncios se move", () => {
  const pagina = ler("app", "r", "[token]", "anuncios", "page.tsx");
  assert.match(pagina, /<AreaChart[\s\S]{0,200}animado/);
  assert.match(pagina, /<Sparkline[\s\S]{0,200}animado/);
});

test("quem pediu menos animação não recebe nenhuma", () => {
  const charts = ler("components", "portal", "portal-charts.tsx");
  assert.match(charts, /prefers-reduced-motion: reduce/);
  assert.match(charts, /if \(!ligado \|\| prefereParado\(\)\)/);
});

test("a animação para quando ninguém está vendo", () => {
  // Laço de rAF rodando numa aba escondida ou fora da tela é bateria do
  // cliente indo embora sem nada em troca.
  const charts = ler("components", "portal", "portal-charts.tsx");
  assert.match(charts, /visibilitychange/);
  assert.match(charts, /IntersectionObserver/);
  assert.match(charts, /cancelAnimationFrame/);
});

test("o gráfico tem nome para quem não enxerga", () => {
  const charts = ler("components", "portal", "portal-charts.tsx");
  assert.match(charts, /role="img"/);
  assert.match(charts, /aria-label=\{descricao/);
  const pagina = ler("app", "r", "[token]", "anuncios", "page.tsx");
  assert.match(pagina, /descricao=\{`Leads por dia/);
});

test("o gráfico diz qual foi o pico", () => {
  const pagina = ler("app", "r", "[token]", "anuncios", "page.tsx");
  assert.match(pagina, /rotuloTopo=\{`pico /,
    "sem rótulo o desenho sobe e desce sem dizer quanto");
});

test("nenhuma função atravessa do servidor para o gráfico", () => {
  // O build NÃO pega isto: "Functions cannot be passed directly to Client
  // Components" só estoura em tempo de execução, e derruba a aba inteira.
  const pagina = ler("app", "r", "[token]", "anuncios", "page.tsx");
  const usos = pagina.match(/<(?:AreaChart|Sparkline)[\s\S]*?\/>/g) ?? [];
  assert.ok(usos.length >= 2, "esperava os dois gráficos na página");
  for (const u of usos) {
    assert.ok(!/=\{\s*\(/.test(u) && !/=\{\s*function/.test(u),
      `prop de função passada ao gráfico:\n${u}`);
  }
});
