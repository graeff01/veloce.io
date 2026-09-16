// ── Camada de segurança · Anel 1: política graduada ───────────────────────────
// A peça central do RFC. Em vez de INSTRUIR o modelo a desconfiar (instrução se
// argumenta, consome tokens e muda a persona), a política REDUZ A CAPACIDADE do
// turno sob suspeita. Capacidade removida não se argumenta.
//
// Nada aqui toca o prompt. Todos os mecanismos acionados JÁ EXISTEM no código —
// a política apenas os liga seletivamente, por turno, em vez de deixá-los como
// flags globais por cliente.

import type { DetectionResult } from "./detect";

export type PolicyProfile = "normal" | "rigor" | "restricted" | "contained";

export interface PolicyDecision {
  profile: PolicyProfile;
  /** Liga grounding determinístico só neste turno (mesmo motor do groundingEnforce). */
  forceGrounding: boolean;
  /** Liga a verificação por LLM só neste turno (mesmo motor do verifyReplies). */
  forceVerify: boolean;
  /** Ferramentas de efeito externo irreversível removidas do toolset do turno. */
  blockedTools: string[];
  /** Gera a resposta mas NÃO envia; escala para humano. */
  contain: boolean;
  score: number;
  labels: string[];
}

// Ferramentas com efeito externo irreversível (mandam algo ao lead / acionam vendedor
// / mudam estado comercial). Sob suspeita alta, saem do toolset — o modelo simplesmente
// não as enxerga, sem instrução e sem recusa.
export const EXTERNAL_EFFECT_TOOLS = [
  "enviar_orcamento",
  "aprovar_orcamento",
  "enviar_catalogo",
  "enviar_video",
] as const;

const MODE = (process.env.AI_SECURITY_MODE ?? "shadow").toLowerCase(); // shadow | enforce | off

export function securityMode(): "shadow" | "enforce" | "off" {
  return MODE === "enforce" ? "enforce" : MODE === "off" ? "off" : "shadow";
}

const T_RIGOR = Number(process.env.AI_SEC_T_RIGOR || 0.3);
const T_RESTRICT = Number(process.env.AI_SEC_T_RESTRICT || 0.6);
const T_CONTAIN = Number(process.env.AI_SEC_T_CONTAIN || 0.85);

// Decide o perfil do turno. PURA — testável.
export function decidePolicy(detection: DetectionResult, mode = securityMode()): PolicyDecision {
  const base: PolicyDecision = {
    profile: "normal", forceGrounding: false, forceVerify: false,
    blockedTools: [], contain: false, score: detection.score, labels: detection.labels,
  };
  if (mode === "off") return base;

  let profile: PolicyProfile = "normal";
  if (detection.score >= T_CONTAIN) profile = "contained";
  else if (detection.score >= T_RESTRICT) profile = "restricted";
  else if (detection.score >= T_RIGOR) profile = "rigor";

  // Em shadow calculamos o perfil (para telemetria) mas NÃO aplicamos nenhuma ação —
  // o turno sai byte-a-byte igual ao de hoje. É o portão de promoção do RFC §6.
  if (mode === "shadow") return { ...base, profile };

  return {
    profile,
    forceGrounding: profile !== "normal",
    // O auditor por LLM NÃO entra no rigor. Medido em conversas reais: pega 6/6
    // das invenções, mas com 40–83% de falso positivo — e o falso positivo dele
    // faz a IA se calar sobre coisa VERDADEIRA (chegou a barrar "a JR não
    // trabalha com cano quadrado", que está cadastrado). Rigor é a faixa que o
    // tráfego real mais toca (47 em 31.764); mandá-la para o auditor trocaria um
    // risco raro por um dano frequente. O embasamento determinístico — que agora
    // confere contra o ACERVO INTEIRO, não contra os 3 blocos recuperados — é o
    // controle certo para essa faixa.
    forceVerify: profile === "restricted",
    blockedTools: profile === "restricted" || profile === "contained" ? [...EXTERNAL_EFFECT_TOOLS] : [],
    contain: profile === "contained",
    score: detection.score,
    labels: detection.labels,
  };
}

export const severityForProfile = (p: PolicyProfile): "info" | "low" | "medium" | "high" | "critical" =>
  p === "contained" ? "critical" : p === "restricted" ? "high" : p === "rigor" ? "medium" : "info";

export const actionForProfile = (p: PolicyProfile) =>
  p === "contained" ? "contained" as const
  : p === "restricted" ? "toolset_reduced" as const
  : p === "rigor" ? "rigor" as const
  : "observed" as const;
