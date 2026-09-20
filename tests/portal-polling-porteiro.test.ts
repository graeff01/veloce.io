import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Nenhuma tela pede dados para uma aba escondida ──────────────────────────
// O porteiro de visibilidade existia (usar-pulso.ts) mas só o shell usava. As
// telas continuavam batendo: Conversas a cada 6s, contadores a cada 20s. Uma
// aba esquecida aberta pedia ~11 mil requisições por noite, por pessoa — dados
// que ninguém estava vendo. Custa servidor nosso, bateria e franquia do cliente.
//
// Varredura de FONTE de propósito: pega uma tela NOVA que nasça sem porteiro,
// que é como isso voltaria.

const DIR = join(import.meta.dirname, "..", "components", "portal");

// portal-alerts é a EXCEÇÃO e tem que continuar sendo: a função dele é avisar
// justamente quando você está em OUTRA aba (toca som, pisca o título). Gatear
// mataria o alerta.
const ISENTOS = new Set(["portal-alerts.tsx"]);

// Intervalos que não vão à rede: relógio de "há X minutos", segundos de
// gravação, animação. Reconhecidos pelo que fazem, não por lista de arquivo.
const SEM_REDE = /setInterval\(\s*\(\)\s*=>\s*set(Agora|RecSecs|Secs|Now)\b|setInterval\(\s*\(\)\s*=>\s*s?e?t?[A-Za-z]*\(\(s\) => s \+ 1\)/;

function temPorteiro(linha: string, arquivo: string): boolean {
  return /visibilityState|document\.hidden|usarPulso/.test(linha)
    || /usarPulso/.test(arquivo);
}

test("todo polling de rede no portal tem porteiro de visibilidade", () => {
  const ofensas: string[] = [];
  for (const nome of readdirSync(DIR)) {
    if (!nome.endsWith(".tsx") || ISENTOS.has(nome)) continue;
    const fonte = readFileSync(join(DIR, nome), "utf8");
    const linhas = fonte.split("\n");
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l.includes("setInterval(")) continue;
      if (SEM_REDE.test(l)) continue;
      // Olha a linha e as duas anteriores (o porteiro às vezes está no `const olhando`).
      const janela = linhas.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (!temPorteiro(janela, fonte)) ofensas.push(`${nome}:${i + 1} → ${l.trim().slice(0, 78)}`);
    }
  }
  assert.deepEqual(ofensas, [], `polling sem porteiro:\n  ${ofensas.join("\n  ")}`);
});

test("o porteiro recarrega ao VOLTAR pra aba (senão a pessoa vê dado velho)", () => {
  const pulso = readFileSync(join(DIR, "usar-pulso.ts"), "utf8");
  assert.match(pulso, /visibilitychange/);
  assert.match(pulso, /addEventListener\("focus"/);
  // No retorno ele chama a função NA HORA, além de religar o intervalo.
  assert.match(pulso, /if \(olhando\(\)\) \{ fn\.current\(\); ligar\(\); \}/);
});

test("portal-alerts continua isento — é o notificador", () => {
  const a = readFileSync(join(DIR, "portal-alerts.tsx"), "utf8");
  assert.match(a, /setInterval\(tick, 12000\)/, "o polling do alerta sumiu — ele precisa rodar com a aba escondida");
});
