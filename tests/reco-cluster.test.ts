import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterBySimilarity, topicSlug, type ClusterItem } from "../lib/ai-agent/eval/reco-cluster";

const it = (id: string, text: string, emb: number[]): ClusterItem => ({ id, text, emb });

test("agrupa vetores parecidos e separa os distantes", () => {
  // dois grupos: [1,0]-ish e [0,1]-ish
  const items = [
    it("a", "garantia?", [1, 0]),
    it("b", "tem garantia", [0.98, 0.02]),
    it("c", "qual o prazo de entrega", [0, 1]),
    it("d", "quando entrega", [0.02, 0.98]),
    it("e", "garantia da churrasqueira", [0.96, 0.05]),
  ];
  const clusters = clusterBySimilarity(items, 0.9);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].size, 3); // grupo garantia (maior) primeiro
  assert.equal(clusters[1].size, 2); // grupo entrega
});

test("threshold alto = mais grupos (mais coeso)", () => {
  const items = [it("a", "x", [1, 0]), it("b", "y", [0.85, 0.15])];
  assert.equal(clusterBySimilarity(items, 0.99).length, 2); // não junta
  assert.equal(clusterBySimilarity(items, 0.8).length, 1);  // junta
});

test("topicSlug: estável e legível", () => {
  assert.equal(topicSlug("Tem garantia da churrasqueira?"), "garantia-churrasqueira");
  assert.equal(topicSlug("!!!"), "geral");
});

test("ignora itens sem embedding", () => {
  const clusters = clusterBySimilarity([it("a", "x", [1, 0]), it("b", "y", [])], 0.8);
  assert.equal(clusters.length, 1);
});
