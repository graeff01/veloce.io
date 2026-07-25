import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scorePolicy, scoreVideoTiming, scoreQuoteTiming, scoreDiscovery,
  scoreMissedOpportunity, scoreHandoff, scoreConversation,
  type ConversationView, type EvalTurn,
} from "../lib/ai-agent/eval/conversation-eval";

const turn = (p: Partial<EvalTurn> = {}): EvalTurn => ({
  inbound: p.inbound ?? "oi", outbound: p.outbound ?? "olá!", decision: p.decision ?? "respondeu_duvida",
  status: p.status ?? "ok", guardrails: p.guardrails ?? [], tools: p.tools ?? [], intent: p.intent ?? null, waMessageId: p.waMessageId ?? null,
});
const view = (p: Partial<ConversationView> = {}): ConversationView => ({
  turns: p.turns ?? [turn()], ficha: p.ficha ?? {}, requiredFields: p.requiredFields ?? [],
  funnelStage: p.funnelStage ?? null, quotesEnabled: p.quotesEnabled ?? false, hasVideo: p.hasVideo ?? false, vertical: p.vertical ?? "servicos",
});

test("políticas: limpo = 1.0; bloqueio e grounding penalizam", () => {
  assert.equal(scorePolicy(view({ turns: [turn(), turn()] })).score, 1);
  assert.equal(scorePolicy(view({ turns: [turn({ status: "blocked", decision: "bloqueado" })] })).score, 0.6);
  assert.equal(scorePolicy(view({ turns: [turn({ guardrails: ["grounding:preco_sem_fonte:enforced"] })] })).score, 0.6);
  const soft = scorePolicy(view({ turns: [turn({ guardrails: ["grounding:preco_sem_fonte:monitor"] })] }));
  assert.equal(soft.score, 0.9); assert.equal(soft.status, "alerta");
});

test("vídeo: N/A sem config; 1.0 no 1º turno; tardio/nunca/repetido", () => {
  assert.equal(scoreVideoTiming(view({ hasVideo: false })).score, null);
  assert.equal(scoreVideoTiming(view({ hasVideo: true, turns: [turn({ tools: [{ name: "enviar_video" }] })] })).score, 1);
  assert.equal(scoreVideoTiming(view({ hasVideo: true, turns: [turn(), turn(), turn(), turn({ tools: [{ name: "enviar_video" }] })] })).score, 0.5);
  assert.equal(scoreVideoTiming(view({ hasVideo: true, turns: [turn(), turn()] })).status, "nunca_enviado");
  assert.equal(scoreVideoTiming(view({ hasVideo: true, turns: [turn({ tools: [{ name: "enviar_video" }] }), turn({ tools: [{ name: "enviar_video" }] })] })).status, "repetido");
});

test("orçamento: gerar+enviar=1.0; sem enviar=0.5; prematuro penaliza; quis e não gerou=0.3", () => {
  assert.equal(scoreQuoteTiming(view({ quotesEnabled: false })).score, null);
  const ok = view({ quotesEnabled: true, turns: [turn({ tools: [{ name: "gerar_orcamento", result: "Orçamento gerado" }, { name: "enviar_orcamento" }] })] });
  assert.equal(scoreQuoteTiming(ok).score, 1);
  const semEnviar = view({ quotesEnabled: true, turns: [turn({ tools: [{ name: "gerar_orcamento", result: "ok" }] })] });
  assert.equal(scoreQuoteTiming(semEnviar).score, 0.5);
  const premature = view({ quotesEnabled: true, turns: [turn({ tools: [{ name: "gerar_orcamento", result: "Ainda NÃO posso gerar — colete antes" }, { name: "enviar_orcamento" }] })] });
  assert.equal(scoreQuoteTiming(premature).score, 0.7);
  const quisNaoGerou = view({ quotesEnabled: true, turns: [turn({ intent: "READY_TO_CLOSE" })] });
  assert.equal(scoreQuoteTiming(quisNaoGerou).score, 0.3);
});

test("descoberta: fração dos campos obrigatórios coletados", () => {
  const req = [{ key: "modelo", label: "Modelo" }, { key: "cidade", label: "Cidade" }];
  const completa = view({ quotesEnabled: true, requiredFields: req, ficha: { modelo: "X", cidade: "Canoas" }, turns: [turn({ tools: [{ name: "gerar_orcamento" }] })] });
  assert.equal(scoreDiscovery(completa).score, 1);
  const meia = view({ quotesEnabled: true, requiredFields: req, ficha: { modelo: "X" }, turns: [turn({ tools: [{ name: "gerar_orcamento" }] })] });
  assert.equal(scoreDiscovery(meia).score, 0.5);
  assert.equal(scoreDiscovery(view({ quotesEnabled: true, requiredFields: [] })).score, null); // nada a medir
});

test("oportunidade perdida: sinal forte sem resposta = perdida", () => {
  assert.equal(scoreMissedOpportunity(view({ turns: [turn()] })).score, null); // sem sinal forte
  const respondido = view({ turns: [turn({ intent: "BUYING_SIGNAL", outbound: "que ótimo!" })] });
  assert.equal(scoreMissedOpportunity(respondido).score, 1);
  const ignorado = view({ turns: [turn({ intent: "BUYING_SIGNAL", outbound: null, status: "skipped" })] });
  assert.equal(scoreMissedOpportunity(ignorado).score, 0);
});

test("handoff: quis fechar + escalou = 1.0; quis e não escalou = 0.4", () => {
  assert.equal(scoreHandoff(view({ turns: [turn()] })).score, null); // nada a escalar
  assert.equal(scoreHandoff(view({ turns: [turn({ intent: "READY_TO_CLOSE", decision: "escalou" })] })).score, 1);
  assert.equal(scoreHandoff(view({ turns: [turn({ intent: "READY_TO_CLOSE" })] })).score, 0.4);
  assert.equal(scoreHandoff(view({ turns: [turn({ decision: "escalou" })] })).score, 0.7); // escalou sem sinal
});

test("agregado: média ponderada só das aplicáveis + confiança por tamanho", () => {
  const r = scoreConversation(view({ turns: [turn(), turn(), turn(), turn()] }));
  assert.ok(r.overall >= 0 && r.overall <= 1);
  assert.equal(r.confidence, 0.9);        // 4+ turnos
  assert.equal(r.method, "deterministic");
  assert.equal(scoreConversation(view({ turns: [turn()] })).confidence, 0.4); // 1 turno = baixa confiança
  // dimensões N/A não entram: conversa simples sem quotes/video → só policy conta
  assert.equal(r.dimensions.videoTiming.score, null);
  assert.equal(r.dimensions.quoteTiming.score, null);
});
