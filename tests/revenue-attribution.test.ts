import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateRevenue, type RevenueSale } from "../lib/meta-attribution";

// Helpers para montar os mapas escopados por conexão (o que o chamador de banco entrega).
const leadMap = (pairs: [string, string | null][]) => new Map<string, string | null>(pairs);
const campByAd = (pairs: [string, string][]) => new Map<string, string>(pairs);
const spend = (pairs: [string, number][]) => new Map<string, number>(pairs);
const meta = (pairs: [string, { name: string; status: string }][]) => new Map(pairs);

test("venda com cadeia completa → atribuída à campanha + ROAS", () => {
  const sales: RevenueSale[] = [{ contactId: "c1", saleValue: 45000 }];
  const r = aggregateRevenue(
    sales,
    leadMap([["c1", "ad1"]]),
    campByAd([["ad1", "camp1"]]),
    spend([["camp1", 9000]]),
    meta([["camp1", { name: "Taos", status: "ACTIVE" }]]),
    9000,
  );
  assert.equal(r.totalRevenue, 45000);
  assert.equal(r.attributedSales, 1);
  assert.equal(r.porCampanha.length, 1);
  assert.equal(r.porCampanha[0].campaignId, "camp1");
  assert.equal(r.porCampanha[0].revenue, 45000);
  assert.equal(r.porCampanha[0].sales, 1);
  assert.equal(r.porCampanha[0].roas, 5); // 45000 / 9000
  assert.equal(r.roasGeral, 5);
  assert.deepEqual(r.naoAtribuida, { sales: 0, revenue: 0 });
  assert.deepEqual(r.semValor, { sales: 0 });
});

test("venda com adId null → não atribuída (nunca inventa origem)", () => {
  const sales: RevenueSale[] = [{ contactId: "c1", saleValue: 30000 }];
  const r = aggregateRevenue(
    sales,
    leadMap([["c1", null]]), // WaLead existe, mas sem adId
    campByAd([]),
    spend([]),
    meta([]),
    0,
  );
  assert.equal(r.totalRevenue, 0);
  assert.equal(r.attributedSales, 0);
  assert.equal(r.porCampanha.length, 0);
  assert.deepEqual(r.naoAtribuida, { sales: 1, revenue: 30000 });
});

test("venda sem WaLead ou com anúncio não sincronizado → não atribuída", () => {
  const sales: RevenueSale[] = [
    { contactId: "semLead", saleValue: 20000 },       // não está no mapa de leads
    { contactId: "adNaoSync", saleValue: 25000 },     // tem adId, mas ad não está no MetaAd
  ];
  const r = aggregateRevenue(
    sales,
    leadMap([["adNaoSync", "adX"]]),
    campByAd([["ad1", "camp1"]]),                     // adX ausente de propósito
    spend([]),
    meta([]),
    0,
  );
  assert.equal(r.attributedSales, 0);
  assert.deepEqual(r.naoAtribuida, { sales: 2, revenue: 45000 });
});

test("venda confirmada sem valor → bucket semValor, não soma receita", () => {
  const sales: RevenueSale[] = [
    { contactId: "c1", saleValue: null },             // vendeu, mas gestor não informou valor
    { contactId: "c2", saleValue: 40000 },
  ];
  const r = aggregateRevenue(
    sales,
    leadMap([["c1", "ad1"], ["c2", "ad1"]]),
    campByAd([["ad1", "camp1"]]),
    spend([["camp1", 8000]]),
    meta([["camp1", { name: "Nivus", status: "ACTIVE" }]]),
    8000,
  );
  assert.equal(r.totalRevenue, 40000);
  assert.equal(r.attributedSales, 1);
  assert.deepEqual(r.semValor, { sales: 1 });
  assert.equal(r.porCampanha[0].revenue, 40000);
});

test("múltiplas vendas na mesma campanha → soma receita e vendas", () => {
  const sales: RevenueSale[] = [
    { contactId: "c1", saleValue: 45000 },
    { contactId: "c2", saleValue: 55000 },
    { contactId: "c3", saleValue: 30000 }, // outra campanha
  ];
  const r = aggregateRevenue(
    sales,
    leadMap([["c1", "ad1"], ["c2", "ad2"], ["c3", "ad3"]]),
    campByAd([["ad1", "camp1"], ["ad2", "camp1"], ["ad3", "camp2"]]),
    spend([["camp1", 20000], ["camp2", 15000]]),
    meta([["camp1", { name: "Taos", status: "ACTIVE" }], ["camp2", { name: "Polo", status: "PAUSED" }]]),
    35000,
  );
  const camp1 = r.porCampanha.find((c) => c.campaignId === "camp1")!;
  assert.equal(camp1.revenue, 100000);
  assert.equal(camp1.sales, 2);
  assert.equal(camp1.roas, 5); // 100000 / 20000
  assert.equal(r.totalRevenue, 130000);
  assert.equal(r.attributedSales, 3);
  // ordena por receita desc → camp1 primeiro
  assert.equal(r.porCampanha[0].campaignId, "camp1");
});

test("ROAS null quando campanha sem gasto no período", () => {
  const r = aggregateRevenue(
    [{ contactId: "c1", saleValue: 50000 }],
    leadMap([["c1", "ad1"]]),
    campByAd([["ad1", "camp1"]]),
    spend([]),                               // sem gasto
    meta([["camp1", { name: "X", status: "ACTIVE" }]]),
    0,
  );
  assert.equal(r.porCampanha[0].roas, null);
  assert.equal(r.roasGeral, null);
});

test("isolamento: venda do cliente B não vaza para a agregação do cliente A", () => {
  // A agregação só enxerga os mapas que recebe (escopados por conexão no banco).
  // Cliente A: contato cA na campanha campA. Cliente B: contato cB na campanha campB.
  const salesA: RevenueSale[] = [{ contactId: "cA", saleValue: 45000 }];

  const rA = aggregateRevenue(
    salesA,
    leadMap([["cA", "adA"]]),                 // mapa do cliente A: NÃO contém cB/adB/campB
    campByAd([["adA", "campA"]]),
    spend([["campA", 9000]]),
    meta([["campA", { name: "A", status: "ACTIVE" }]]),
    9000,
  );

  // Só a campanha de A aparece; nada de B.
  assert.equal(rA.porCampanha.length, 1);
  assert.equal(rA.porCampanha[0].campaignId, "campA");
  assert.ok(!rA.porCampanha.some((c) => c.campaignId === "campB"));

  // Se por engano uma venda do cliente B (cB) entrasse no lote de A, como o mapa de
  // A não a resolve, ela cai em "não atribuída" — jamais some na campanha de B.
  const rMix = aggregateRevenue(
    [...salesA, { contactId: "cB", saleValue: 99999 }],
    leadMap([["cA", "adA"]]),
    campByAd([["adA", "campA"]]),
    spend([["campA", 9000]]),
    meta([["campA", { name: "A", status: "ACTIVE" }]]),
    9000,
  );
  assert.equal(rMix.porCampanha.length, 1);
  assert.equal(rMix.porCampanha[0].revenue, 45000);       // continua só a receita de A
  assert.deepEqual(rMix.naoAtribuida, { sales: 1, revenue: 99999 });
});
