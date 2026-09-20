import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Todas as telas do portal usam a largura cheia ───────────────────────────
// Consumo e Frete travavam em 900px centrado; Aprendizado e Centro de evolução
// também; Fechamento e Revisão capavam em 1440 SEM centralizar, o que deixava
// faixa morta à direita em tela grande. O cliente reparou em duas e a varredura
// achou as outras quatro.
//
// Isto vale para o CONTÊINER da tela. Largura em modal, imagem, aviso flutuante
// e parágrafo é legítima — modal de 1920px de largura seria absurdo, e linha de
// texto longa demais é ruim de ler.

const DIR = join(import.meta.dirname, "..", "components", "portal");

// Classes que envolvem a tela inteira, uma por página.
const CONTEINERES = /\.(lwrap|fwrap|rwrap|cwrap|p-wrap)\{([^}]*)\}/g;

test("nenhum contêiner de tela limita a largura", () => {
  const ofensas: string[] = [];
  for (const nome of readdirSync(DIR)) {
    if (!nome.endsWith(".tsx")) continue;
    const fonte = readFileSync(join(DIR, nome), "utf8");
    for (const m of fonte.matchAll(CONTEINERES)) {
      if (/max-width/.test(m[2])) ofensas.push(`${nome} → ${m[0].slice(0, 70)}`);
    }
  }
  assert.deepEqual(ofensas, [], `contêiner com largura travada:\n  ${ofensas.join("\n  ")}`);
});

test("nenhuma tela do portal se centraliza com margin auto", () => {
  const ofensas: string[] = [];
  for (const nome of readdirSync(DIR)) {
    if (!nome.endsWith(".tsx")) continue;
    for (const l of readFileSync(join(DIR, nome), "utf8").split("\n")) {
      // Centralizar + limitar juntos é a assinatura da tela estreita. Um modal
      // centraliza mas usa position/fixed; um parágrafo limita mas não centra.
      if (/maxWidth:\s*(8[0-9]{2}|9[0-9]{2}|1[0-9]{3})\b/.test(l) && /margin:\s*"0 auto"|marginInline:\s*"auto"/.test(l)) {
        ofensas.push(`${nome} → ${l.trim().slice(0, 74)}`);
      }
    }
  }
  assert.deepEqual(ofensas, [], `tela centralizada e estreita:\n  ${ofensas.join("\n  ")}`);
});

test("o esqueleto de carregamento tem a mesma largura da página pronta", () => {
  // Com limite só no esqueleto, o conteúdo "saltava" para os lados ao carregar.
  const sk = readFileSync(join(import.meta.dirname, "..", "app", "r", "[token]", "loading.tsx"), "utf8");
  assert.doesNotMatch(sk, /maxWidth:\s*\d{3,4}/, "o esqueleto limita a largura e a página não");
});
