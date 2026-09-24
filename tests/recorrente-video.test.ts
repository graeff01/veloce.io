import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const orq = readFileSync(join(process.cwd(), "lib", "ai-agent", "orchestrator.ts"), "utf8");

// ── "Não recomece do zero" não pode pular etapa que nunca aconteceu ──────────
// Caso real apontado pela Maria (Eduardo Carvalho, 24/09/2026): o lead escreveu
// em 13/08, recebeu só a saudação e sumiu. Voltou 42 dias depois perguntando de
// churrasqueira e a IA, lendo "lead recorrente, não repita perguntas já
// respondidas", pulou a pergunta de loja e o VÍDEO de apresentação — que ele
// nunca tinha visto.
//
// O sistema já sabe se o vídeo saiu (é a mesma informação que impede reenviá-lo).
// O contexto passa a afirmar o FATO em vez de deixar o modelo deduzir.

test("o contexto de lead recorrente diz se o vídeo já foi visto", () => {
  const bloco = /const viuVideo = await prisma\.waMessage\.findFirst\(\{[\s\S]*?\}\)\.catch\(\(\) => null\);/.exec(orq);
  assert.ok(bloco, "sumiu a checagem de vídeo já enviado");
  assert.match(bloco[0], /type: "video", aiGenerated: true/,
    "é o vídeo que a IA mandou, não qualquer vídeo do lead");
});

test("quem não viu recebe instrução de NÃO pular a apresentação", () => {
  assert.match(orq, /AINDA NÃO viu o vídeo de apresentação[\s\S]{0,120}não pule por ser recorrente/,
    "sem isto, 'é recorrente' volta a suprimir o vídeo de quem nunca o viu");
});

test("quem já viu continua protegido do reenvio", () => {
  assert.match(orq, /J[ÁA] viu o vídeo de apresentação[^"]*não mande de novo/);
});

test("cliente sem vídeo configurado não recebe nota nenhuma", () => {
  // Boqueirão e demo não têm vídeo de apresentação: falar dele seria ruído.
  assert.match(orq, /cfg\?\.presentationVideoUrl\s*\n?\s*\?\s*\(viuVideo/,
    "a nota só existe quando o cliente tem vídeo configurado");
});
