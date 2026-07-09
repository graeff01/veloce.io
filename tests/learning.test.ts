import { test } from "node:test";
import assert from "node:assert/strict";
import { attributeOutcome, aggregatePerformance, type Outcome } from "../lib/ai-agent/learning";

test("attributeOutcome: venda confirmada e convertido → won; perdido → lost; qualif → qualified", () => {
  assert.equal(attributeOutcome({ funnelStage: null, saleConfirmedAt: new Date() }), "won");
  assert.equal(attributeOutcome({ funnelStage: "convertido", saleConfirmedAt: null }), "won");
  assert.equal(attributeOutcome({ funnelStage: "perdido", saleConfirmedAt: null }), "lost");
  assert.equal(attributeOutcome({ funnelStage: "qualificado", saleConfirmedAt: null }), "qualified");
  assert.equal(attributeOutcome({ funnelStage: "negociacao", saleConfirmedAt: null }), "qualified");
  assert.equal(attributeOutcome({ funnelStage: "recebido", saleConfirmedAt: null }), "open");
  assert.equal(attributeOutcome({ funnelStage: null, saleConfirmedAt: null }), "open");
});

test("aggregatePerformance: taxas e líder por amostra", () => {
  const mk = (variant: string, o: Outcome, n: number) => Array.from({ length: n }, () => ({ variant, outcome: o }));
  const rows = [
    ...mk("A", "won", 5), ...mk("A", "qualified", 5), ...mk("A", "lost", 10), ...mk("A", "open", 5),   // 25 total
    ...mk("B", "won", 12), ...mk("B", "qualified", 8), ...mk("B", "lost", 5), ...mk("B", "open", 0),   // 25 total
  ];
  const { variants, leader } = aggregatePerformance(rows, 20);
  const A = variants.find((v) => v.variant === "A")!;
  const B = variants.find((v) => v.variant === "B")!;
  // A: qualify (5+5)/25 = 0.4 ; win 5/(5+10)=0.333
  assert.equal(A.qualifyRate, 0.4);
  assert.equal(A.winRate, 0.333);
  // B: qualify (12+8)/25 = 0.8 ; win 12/(12+5)=0.706
  assert.equal(B.qualifyRate, 0.8);
  assert.equal(B.winRate, 0.706);
  // Ordena por qualifyRate desc → B primeiro; líder = B (ambas ≥20).
  assert.equal(variants[0].variant, "B");
  assert.equal(leader?.variant, "B");
});

test("aggregatePerformance: sem amostra suficiente → sem líder", () => {
  const rows = [{ variant: "A", outcome: "won" as Outcome }, { variant: "B", outcome: "lost" as Outcome }];
  const { leader, note } = aggregatePerformance(rows, 20);
  assert.equal(leader, null);
  assert.ok(note.includes("pequena"));
});
