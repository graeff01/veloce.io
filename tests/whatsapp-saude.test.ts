import { test } from "node:test";
import assert from "node:assert/strict";
import { ehFalhaDeAutenticacao } from "@/lib/whatsapp-saude";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Token recusado ───────────────────────────────────────────────────────────
// A falha mais silenciosa do módulo: o número CONTINUA recebendo (o webhook não
// usa o nosso token), então `lastEventAt` segue atualizando e o alerta de
// "número mudo" diz que está tudo bem. O que quebra é o resto — a mídia não
// abre e a IA não responde.

test("só erro de CREDENCIAL marca o número", () => {
  // 190 expirado/revogado · 200 e 10 sem permissão · 2500 requisição sem sessão
  for (const c of [190, 200, 10, 2500]) {
    assert.equal(ehFalhaDeAutenticacao(c), true, `${c} é credencial`);
  }
});

test("recusa de conteúdo e limite de taxa NÃO marcam", () => {
  // Marcar tudo faria o alerta virar ruído — que é como um alerta deixa de ser
  // lido. Janela de 24h fechada, template reprovado e excesso de chamadas são
  // problemas reais, mas não são credencial morta.
  for (const c of [131047, 131026, 4, 80007, 368]) {
    assert.equal(ehFalhaDeAutenticacao(c), false, `${c} não é credencial`);
  }
  assert.equal(ehFalhaDeAutenticacao(undefined), false);
  assert.equal(ehFalhaDeAutenticacao("190"), false, "string não conta — só número");
});

test("todo ponto que fala com a Meta reporta o desfecho", () => {
  // Um ponto esquecido é um número que quebra sem ninguém saber. O teste varre
  // o arquivo em vez de confiar em revisão.
  const linhas = readFileSync(join(process.cwd(), "lib", "whatsapp-send.ts"), "utf8").split("\n");
  const semReporte: number[] = [];
  linhas.forEach((l, i) => {
    if (!l.includes("if (!res.ok)")) return;
    const antes = linhas.slice(Math.max(0, i - 5), i).join("\n");
    if (!antes.includes("registrarDesfecho")) semReporte.push(i + 1);
  });
  assert.deepEqual(semReporte, [], `linhas sem reportar à saúde do número: ${semReporte}`);
});

test("marcar a saúde nunca derruba o envio", () => {
  // Best-effort de propósito: uma falha ao gravar o estado não pode virar
  // exceção no meio do atendimento de um lead.
  const fonte = readFileSync(join(process.cwd(), "lib", "whatsapp-saude.ts"), "utf8");
  const corpo = fonte.slice(fonte.indexOf("export function registrarDesfecho"));
  assert.match(corpo, /void prisma/, "as escritas são disparadas sem await");
  assert.equal((corpo.match(/catch\(\(\) => \{\}\)/g) ?? []).length, 2, "e cada uma engole o próprio erro");
});

test("a primeira falha é preservada — é ela que diz há quanto tempo", () => {
  const fonte = readFileSync(join(process.cwd(), "lib", "whatsapp-saude.ts"), "utf8");
  assert.match(fonte, /where: \{ phoneNumberId, tokenFalhouEm: null \}/,
    "marcar de novo não pode reiniciar o relógio da falha");
});
