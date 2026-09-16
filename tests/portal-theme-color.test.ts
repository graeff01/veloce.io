import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(process.cwd(), "app", "r", "[token]", "layout.tsx"), "utf8");
const tema = readFileSync(join(process.cwd(), "lib", "portal-theme.ts"), "utf8");

// ── Por que isto existe ──────────────────────────────────────────────────────
// Sem `theme-color`, o Safari usa a barra translúcida dele, que AMOSTRA o
// conteúdo da página por trás. No telefone isso lê como "o conteúdo está
// passando por cima da barra" — reportado três vezes, em dois clientes
// diferentes. Nenhuma correção de CSS resolvia, porque a barra é do navegador,
// não nossa. Foi preciso comparar o horário da foto com o do deploy para
// descobrir que o problema sobrevivia às correções.

test("o portal declara a cor da barra do navegador", () => {
  assert.match(layout, /themeColor:/, "sem isto o Safari escolhe sozinho e mostra o conteúdo atrás");
});

test("a cor segue o modo do portal, não o do sistema", () => {
  // O cliente escolhe claro ou escuro no cadastro; a barra tem que combinar com
  // o que ele vê, não com a preferência do aparelho.
  assert.match(layout, /portal\?\.mode === "dark"/);
  assert.match(layout, /export async function generateViewport/);
});

test("as cores batem com as do tema", () => {
  // Se o tema mudar e isto não, a barra fica de uma cor e o app de outra.
  const claro = (layout.match(/const CLARO = "(#[0-9a-f]{6})"/) ?? [])[1];
  const escuro = (layout.match(/const ESCURO = "(#[0-9a-f]{6})"/) ?? [])[1];
  assert.ok(claro && escuro, "as constantes precisam existir");
  assert.ok(tema.includes(`surface: "${claro}"`), `o tema claro não usa ${claro}`);
  assert.ok(tema.includes(`surface: "${escuro}"`), `o tema escuro não usa ${escuro}`);
});

test("o viewport-fit não se perdeu na mudança", () => {
  // Ele é o que faz env(safe-area-inset-*) valer no iPhone.
  assert.match(layout, /viewportFit: "cover"/);
});
