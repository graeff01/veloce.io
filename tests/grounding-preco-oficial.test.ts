import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding, extrairPrecosOficiais } from "../lib/ai-agent/grounding";

// ── Por que isto existe ──────────────────────────────────────────────────────
// A janela curta de histórico é podada em 1.200 tokens. Numa conversa longa, a
// mensagem em que a PRÓPRIA IA deu o preço sai da janela — e como o grounding
// conferia contra ela, a IA passava a se ABSTER de um valor que já tinha dado
// certo. Visto em simulação contra conversa real da JR: o lead pede de novo o
// preço da Prime 7 dois turnos depois de recebê-lo e ouve "prefiro confirmar
// com um vendedor". Quanto mais longa a conversa, mais ela se calava.

// Preços reais da JR.
const REGRAS = {
  base: [
    { key: "prime7", label: "Prime 7 espetos", amount: 1247, montagem: 300 },
    { key: "gourmet", label: "Gourmet", amount: 4197 },
  ],
  freight: [{ region: "Litoral", amount: 410 }, { region: "Torres", amount: 700 }],
  policies: { access: { spiral: 200, elevator: 100, stairPerFlight: 100 } },
};

test("a tabela oficial é lida inteira", () => {
  const p = extrairPrecosOficiais(REGRAS);
  for (const v of ["1247", "4197", "410", "700", "300", "200", "100"]) {
    assert.ok(p.has(v), `faltou ${v}`);
  }
});

test("preço da tabela NÃO abstém, mesmo fora da janela de histórico", () => {
  const semFonte = checkGrounding("A Prime 7 sai por R$ 1.247,00.", "conversa sem números");
  assert.equal(semFonte.grounded, false, "hoje, sem a tabela, ela se absteria");

  const comTabela = checkGrounding("A Prime 7 sai por R$ 1.247,00.", "conversa sem números", extrairPrecosOficiais(REGRAS));
  assert.equal(comTabela.grounded, true, "com a tabela, responde");
});

test("preço inventado continua sendo barrado", () => {
  const r = checkGrounding("Consigo fazer por R$ 999,00 pra você.", "conversa sem números", extrairPrecosOficiais(REGRAS));
  assert.equal(r.grounded, false);
  assert.deepEqual(r.priceViolations, ["R$ 999,00"]);
});

test("a conferência é por igualdade, não por pedaço do número", () => {
  // O teste geral usa `includes` sobre dígitos concatenados. Se a tabela entrasse
  // ali, "R$ 124,00" passaria só por ser pedaço de "1247" — e todo cliente ficaria
  // com o grounding mais frouxo. Por isso a lista é fechada.
  const r = checkGrounding("Fica R$ 124,00.", "conversa sem números", extrairPrecosOficiais(REGRAS));
  assert.equal(r.grounded, false, "pedaço de preço oficial não é preço oficial");
});

test("com ou sem centavos é o mesmo valor", () => {
  const p = extrairPrecosOficiais(REGRAS);
  assert.equal(checkGrounding("R$ 410", "", p).grounded, true);
  assert.equal(checkGrounding("R$ 410,00", "", p).grounded, true);
});

test("sem tabela, o comportamento é exatamente o de antes", () => {
  const antes = checkGrounding("R$ 1.247,00", "o lead falou em R$ 1.247,00");
  assert.equal(antes.grounded, true, "fonte na conversa continua valendo");
  const semNada = checkGrounding("R$ 1.247,00", "nada aqui");
  assert.equal(semNada.grounded, false);
});

test("prazo sem fonte segue como aviso, não abstenção", () => {
  const r = checkGrounding("Entrego em 15 dias.", "sem prazo aqui", extrairPrecosOficiais(REGRAS));
  assert.equal(r.grounded, true, "prazo nunca abstém");
  assert.ok(r.deadlineWarnings.length > 0);
});
