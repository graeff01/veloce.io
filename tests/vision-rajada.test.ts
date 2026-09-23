import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const respond = readFileSync(join(process.cwd(), "lib", "ai-agent", "respond.ts"), "utf8");

// ── A foto que o lead manda na rajada ─────────────────────────────────────────
// Um AiJob é UM por contato: a rajada colapsa nele e o payload guarda só a
// ÚLTIMA mensagem. Caso real (Lukas, 07/09/2026): duas fotos, depois "quanto sai
// essas duas?" e "vcs instalam?". O payload final era do tipo "text", então as
// DUAS fotos eram descartadas e a IA respondeu sem nunca olhar o que ele mandou —
// com visionEnabled LIGADO.
//
// Depende de banco, então a trava é de estrutura (mesmo estilo dos testes de
// portal e de fila).

test("as imagens vêm do banco, não do payload do job", () => {
  const bloco = /let inboundImages: string\[\] \| undefined;[\s\S]*?\n  \}/.exec(respond);
  assert.ok(bloco, "não achei o bloco de vision");

  assert.doesNotMatch(bloco[0], /if \(cfg\?\.visionEnabled && input\.payload\.type === "image"\)/,
    'gatear por `payload.type === "image"` descarta as fotos da rajada');
  assert.match(bloco[0], /direction: "in", type: "image"/,
    "precisa buscar as imagens recebidas no banco");
  assert.match(bloco[0], /timestamp: \{ gt: ultimaSaida\.timestamp \}/,
    "só as que chegaram DESDE a última saída — é o que ainda não foi respondido");
});

test("há teto de fotos por turno, e ele é configurável", () => {
  // Cada foto custa ~1.100 tokens de entrada (tests/vision-imagem.test.ts faz a
  // conta). Sem teto, uma rajada de 8 fotos vira um turno caro.
  assert.match(respond, /const MAX_INBOUND_IMAGES = Number\(process\.env\.AI_MAX_INBOUND_IMAGES \|\| 3\)/);
  assert.match(respond, /take: MAX_INBOUND_IMAGES/);
});

test("a rede de segurança da Meta continua, só depois do banco", () => {
  // A imagem DESTE turno pode não ter sido salva (a Meta retém por pouco tempo).
  const bloco = /let inboundImages: string\[\] \| undefined;[\s\S]*?\n  \}/.exec(respond)!;
  const iBanco = bloco[0].indexOf("waMessage.findMany");
  const iMeta = bloco[0].indexOf("fetchWhatsAppImageDataUri");
  assert.ok(iBanco > 0 && iMeta > iBanco, "o banco vem primeiro; a Meta é fallback");
  assert.match(bloco[0], /if \(!uris\.length && input\.payload\.type === "image"/,
    "só cai na Meta quando o banco não tinha nada");
});

test("só mime de imagem permitido entra no contexto", () => {
  const bloco = /let inboundImages: string\[\] \| undefined;[\s\S]*?\n  \}/.exec(respond)!;
  assert.match(bloco[0], /ALLOWED_IMAGE_MIME\.has\(m\.media\.mime\)/);
});
