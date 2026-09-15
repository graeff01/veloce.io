import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

// ── Custo de ler uma foto (gpt-4.1-mini, contagem por ladrilhos) ─────────────
// Regra oficial: encolhe para caber em 2048×2048; se o lado MENOR passa de 768,
// encolhe até 768; conta ladrilhos de 512; 85 tokens de base + 170 por ladrilho.
// As dimensões abaixo são de fotos REAIS enviadas por leads da JR.
function tokensDaFoto(l: number, a: number): number {
  let [x, y] = [l, a];
  const cabe = Math.min(2048 / x, 2048 / y, 1);
  x = Math.round(x * cabe); y = Math.round(y * cabe);
  const menor = Math.min(x, y);
  if (menor > 768) { const f = 768 / menor; x = Math.round(x * f); y = Math.round(y * f); }
  return 85 + 170 * (Math.ceil(x / 512) * Math.ceil(y / 512));
}

test("uma foto de lead custa entre 765 e 1445 tokens", () => {
  const reais: [number, number][] = [
    [1131, 1600], [1600, 900], [900, 1600], [736, 1600],
    [1080, 1343], [1080, 1157], [1200, 1600],
  ];
  const t = reais.map(([l, a]) => tokensDaFoto(l, a));
  assert.ok(Math.min(...t) >= 765, `mínimo inesperado: ${Math.min(...t)}`);
  assert.ok(Math.max(...t) <= 1445, `máximo inesperado: ${Math.max(...t)}`);
});

test("a conta do mês cabe em centavos", () => {
  // 727 fotos em 7 semanas ≈ 450/mês. Entrada do gpt-4.1-mini: US$ 0,40 por
  // milhão de tokens (lib/ai-agent/usage.ts). Este teste existe para o dia em
  // que alguém trocar o modelo por um caro sem perceber o efeito na foto.
  const porFoto = tokensDaFoto(1200, 1600);          // caso típico
  const mensal = (450 * porFoto / 1e6) * 0.40;
  assert.ok(mensal < 0.5, `esperava menos de US$0,50/mês, deu ${mensal.toFixed(3)}`);
});

test("o preço do gpt-4.1-mini não mudou por baixo do pano", () => {
  const usage = ler("lib", "ai-agent", "usage.ts");
  assert.match(usage, /"gpt-4\.1-mini": \{ in: 0\.4,/,
    "se o preço de entrada mudou, a conta da foto acima precisa ser refeita");
});

// ── Robustez ────────────────────────────────────────────────────────────────

test("a vision lê a imagem que já guardamos, não rebaixa da Meta", () => {
  // O webhook guarda a foto no instante em que chega. Rebaixá-la na hora de
  // responder eram duas chamadas de rede a mais, dependentes de o token ainda
  // estar válido, no meio do caminho de atender o lead.
  const r = ler("lib", "ai-agent", "respond.ts");
  const bloco = r.slice(r.indexOf("Vision (opt-in)"), r.indexOf("// 7) Gera a resposta"));
  assert.match(bloco, /prisma\.waMedia\.findUnique/);
  assert.ok(bloco.indexOf("prisma.waMedia.findUnique") < bloco.indexOf("fetchWhatsAppImageDataUri"),
    "o armazenamento próprio vem primeiro; a Meta é o plano B");
  assert.match(bloco, /if \(!uri && input\.payload\.mediaId\)/, "a Meta continua como plano B");
});

test("só mime de imagem vira data URI", () => {
  const r = ler("lib", "ai-agent", "respond.ts");
  assert.match(r, /ALLOWED_IMAGE_MIME\.has\(guardada\.mime\)/);
});

test("o webhook manda o id da mensagem no job", () => {
  // Sem ele a vision não acha a imagem guardada e cai sempre na Meta.
  const w = ler("app", "api", "whatsapp", "webhook", "route.ts");
  assert.match(w, /messageId: createdMsg\.id/);
});
