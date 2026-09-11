import { test } from "node:test";
import assert from "node:assert/strict";
import { anexar, relatorio, relevantes, TETO, type Ocorrencia } from "../src/core/diagnostico";

const o = (nivel: Ocorrencia["nivel"], texto: string, em = 0): Ocorrencia => ({ em, nivel, texto });

test("o diário não cresce sem limite", () => {
  let d: Ocorrencia[] = [];
  for (let i = 0; i < TETO + 15; i++) d = anexar(d, o("erro", `e${i}`, i));
  assert.equal(d.length, TETO);
  // Guarda as MAIS RECENTES: quem investiga quer o que aconteceu perto da falha.
  assert.equal(d[d.length - 1]?.texto, `e${TETO + 14}`);
  assert.equal(d[0]?.texto, `e${15}`);
});

test("info não entra no relatório", () => {
  const d = [o("info", "abriu"), o("aviso", "rede lenta"), o("erro", "falhou")];
  assert.deepEqual(relevantes(d).map((x) => x.nivel), ["aviso", "erro"]);
});

test("relatório sem erro nenhum diz isso, em vez de sair vazio", () => {
  const txt = relatorio([o("info", "abriu")], {
    versao: "1.0.0", aparelho: "iPhone", sistema: "iOS 18", servidor: "api.exemplo",
  });
  assert.match(txt, /Nenhum erro registrado/);
  assert.match(txt, /Versão: 1\.0\.0/);
});

test("relatório traz as ocorrências com nível e horário", () => {
  const txt = relatorio([o("erro", "falha de rede em /conversations", Date.parse("2026-09-07T13:45:09"))], {
    versao: "1.0.0", aparelho: "iPhone", sistema: "iOS 18", servidor: "api.exemplo",
  });
  // Colunas alinhadas: "ERRO " e "aviso" têm a mesma largura de propósito.
  assert.match(txt, /13:45:09 {2}ERRO {3}falha de rede em \/conversations/);
});
