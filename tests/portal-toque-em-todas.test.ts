import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Toda tela do portal precisa das regras de toque ──────────────────────────
// Bug real: a tela de CONVERSAS — a mais usada do PWA — não carregava o
// PORTAL_UI_CSS, então ficou sem a regra que impede o iOS de DAR ZOOM ao tocar
// num campo, e sem o `touch-action` que desliga o toque duplo. O defeito foi
// reportado duas vezes e as duas correções anteriores não pegaram, porque o CSS
// simplesmente não chegava lá.
//
// Este teste percorre as páginas do portal e exige que cada uma carregue as
// regras — direto (PORTAL_TOQUE_CSS) ou pelo pacote que as contém.

const RAIZ = join(process.cwd(), "app", "r", "[token]");

function paginas(dir: string, achadas: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) paginas(p, achadas);
    else if (e.name === "page.tsx") achadas.push(p);
  }
  return achadas;
}

test("o pacote de toque existe e traz o que importa", () => {
  const tema = readFileSync(join(process.cwd(), "lib", "portal-theme.ts"), "utf8");
  const i = tema.indexOf("export const PORTAL_TOQUE_CSS");
  assert.ok(i > 0, "PORTAL_TOQUE_CSS precisa ser exportado");
  const bloco = tema.slice(i, tema.indexOf("export const PORTAL_UI_CSS"));
  assert.match(bloco, /font-size:16px!important/, "sem isto o iOS dá zoom ao focar um campo");
  assert.match(bloco, /touch-action:manipulation/, "sem isto o toque duplo dá zoom");
  assert.match(bloco, /tap-highlight-color/);
});

test("o PORTAL_UI_CSS continua incluindo o pacote de toque", () => {
  // As outras telas dependem disso; extrair não podia tirar delas.
  const tema = readFileSync(join(process.cwd(), "lib", "portal-theme.ts"), "utf8");
  const ui = tema.slice(tema.indexOf("export const PORTAL_UI_CSS"));
  assert.match(ui, /\$\{PORTAL_TOQUE_CSS\}/);
});

test("nenhuma tela do portal fica sem as regras de toque", () => {
  assert.ok(existsSync(RAIZ), "não achei as páginas do portal");
  const semRegras: string[] = [];
  for (const arq of paginas(RAIZ)) {
    const src = readFileSync(arq, "utf8");
    // Tela que nem monta interface (redirect puro) não precisa.
    if (!/<style>/.test(src)) continue;
    if (/PORTAL_TOQUE_CSS|PORTAL_UI_CSS/.test(src)) continue;
    semRegras.push(arq.replace(process.cwd() + "/", ""));
  }
  assert.deepEqual(semRegras, [],
    `estas telas renderizam interface sem as regras de toque:\n  ${semRegras.join("\n  ")}`);
});
