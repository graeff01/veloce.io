import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const fila = ler("lib", "ai-agent", "queue.ts");

// ── O turno duplicado e a mensagem engolida ───────────────────────────────────
//
// Reconstituído de produção (Willian Ribeiro, 21/09/2026, e Henrique, 05/09):
//
//   09:52:42  lead: "Fogão campeiro"        → job criado, debounce
//   09:52:47  turno A começa
//   09:52:48  lead: "Queria saber os valores?" → enqueue faz UPSERT
//   09:52:49  turno A começa a enviar (3 blocos)
//   09:52:53  o UPSERT zerou status/lockedAt → o nudge consegue o claim
//             → turno B roda em PARALELO sobre a mesma conversa
//   09:52:49..58  os 3 blocos saem DUAS VEZES, intercalados
//
// E só existe UMA linha em AiInteraction: o turno B colidiu na chave de
// idempotência e foi descartado DEPOIS de já ter enviado ao lead. A pergunta
// "Queria saber os valores?" nunca gerou turno nenhum — o delete cego do fim do
// turno A apagou o job que a carregava.
//
// Estes testes travam as duas metades da correção. São invariantes de estrutura
// (o mesmo estilo dos testes de portal), porque a função depende de banco.

test("o enqueue NÃO solta a trava de um turno em voo", () => {
  // O bloco `update:` do upsert é o que roda quando já existe job para o
  // contato — inclusive com turno em voo. Se voltar a mexer em status/lockedAt,
  // a duplicação volta.
  const upsert = /aiJob\.upsert\(\{[\s\S]*?\n  \}\);/.exec(fila);
  assert.ok(upsert, "não achei o upsert do enqueue");
  const update = /update: \{[\s\S]*?\},/.exec(upsert[0]);
  assert.ok(update, "não achei o bloco update do upsert");

  assert.doesNotMatch(update[0], /status:/,
    'o update do upsert não pode reescrever `status` — era o que liberava o segundo turno');
  assert.doesNotMatch(update[0], /lockedAt:/,
    'o update do upsert não pode zerar `lockedAt` — era o que liberava o segundo turno');
  // E o que ele DEVE atualizar: a mensagem nova e o novo fim de debounce.
  assert.match(update[0], /idempotencyKey:/);
  assert.match(update[0], /payload:/);
  assert.match(update[0], /runAfter/);
});

test("o fim do turno apaga só o job que ele processou", () => {
  // `delete({ where: { contactId } })` no caminho de sucesso apagava a mensagem
  // que chegou durante o turno. O delete tem de ser condicionado à chave.
  const sucesso = /if \(outcome === "error"\) throw[\s\S]*?\n  \} catch/.exec(fila);
  assert.ok(sucesso, "não achei o caminho de sucesso do runner");
  assert.match(sucesso[0], /deleteMany\(\{ where: \{ contactId, idempotencyKey: job\.idempotencyKey \} \}\)/,
    "o delete do caminho de sucesso precisa ser condicionado à chave processada");
  assert.doesNotMatch(sucesso[0], /aiJob\.delete\(/,
    "delete cego no caminho de sucesso engole a mensagem que chegou durante o turno");
});

test("mensagem que chegou durante o turno é reprocessada, não esquecida", () => {
  assert.match(fila, /if \(apagados\.count === 0\) \{\s*\n[\s\S]{0,400}?liberarEReagendar\(contactId\)/,
    "quando o delete não casa, o job novo tem de ser liberado e reagendado");
  // A liberação só pode tocar linha `processing` — se outro worker assumiu, não
  // se interfere no trabalho dele.
  const liberar = /async function liberarEReagendar[\s\S]*?\n\}/.exec(fila);
  assert.ok(liberar, "não achei liberarEReagendar");
  assert.match(liberar[0], /where: \{ contactId, status: "processing" \}/);
  assert.match(liberar[0], /agendarNudge/, "sem reagendar, o lead espera o STALE_LOCK_MS inteiro");
});

test("a rede de segurança do job preso continua de pé", () => {
  // Não resetar o status no enqueue só é seguro porque estes dois caminhos
  // existem: o claim reaproveita `processing` velho, e o catch devolve o job
  // para `pending` com backoff. Se algum sair, job preso = lead no vácuo.
  assert.match(fila, /\{ status: "processing", lockedAt: \{ lt: staleBefore \} \}/,
    "o claim precisa continuar reaproveitando job processing vencido");
  assert.match(fila, /catch[\s\S]*?data: \{ status: "pending", attempts, lockedAt: null/,
    "o catch precisa continuar devolvendo o job para pending");
  assert.match(fila, /const STALE_LOCK_MS = 2 \* 60_000;/,
    "se o STALE_LOCK_MS mudar, reveja o tempo máximo que um job preso fica parado");
});

test("o pin de localização não depende do payload para chegar ao motor", () => {
  // enqueueLocationJob re-enfileira com a MESMA idempotencyKey depois do
  // geocode, então o deleteMany condicional NÃO distingue esse segundo enqueue.
  // Isso é seguro porque as coordenadas e o endereço são gravados em
  // LeadProfile ANTES do re-enqueue, e é de lá que gerar_orcamento lê a zona —
  // o payload é só o texto de instrução. Se algum dia o pin passar a viajar só
  // no payload, este teste tem de falhar e a correção da fila precisa de um
  // caminho próprio para ele.
  const webhook = ler("app", "api", "whatsapp", "webhook", "route.ts");
  const fn = /async function enqueueLocationJob[\s\S]*?\n\}/.exec(webhook);
  assert.ok(fn, "não achei enqueueLocationJob");
  const gravaFicha = fn[0].indexOf("leadProfile.upsert");
  const reenqueue = fn[0].lastIndexOf("await enqueue(");
  assert.ok(gravaFicha > 0 && reenqueue > gravaFicha,
    "a ficha precisa ser gravada ANTES do re-enqueue, senão o endereço depende do payload");
});

test("turno MORTO é reaberto pelo enqueue; turno VIVO não", () => {
  // Não resetar o status é o que mata a duplicação, mas um turno pode morrer no
  // meio — e o caso comum é DEPLOY, com o processo caindo e o job preso em
  // `processing`. Antes, a mensagem nova resetava e o nudge respondia na hora.
  // Sem esta reabertura, a recuperação dependeria do lock envelhecer ou do cron,
  // que neste projeto é agendado por fora.
  const reabre = /aiJob\.updateMany\(\{\s*\n\s*where: \{ contactId: job\.contactId, status: "processing", lockedAt: \{ lt: new Date\(Date\.now\(\) - STALE_LOCK_MS\) \} \}/.exec(fila);
  assert.ok(reabre, "o enqueue precisa reabrir job processing com lock VELHO");
  // E a condição tem de ser a mesma do claim — lock recente é turno vivo.
  assert.match(fila, /data: \{ status: "pending", lockedAt: null \},\s*\n\s*\}\)\.catch/);
});
