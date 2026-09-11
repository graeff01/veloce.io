// ── Camada de segurança · Anel 6: trilha de eventos ───────────────────────────
// Emissor único de AiSecurityEvent. Best-effort e FAIL-OPEN por construção: se a
// tabela ainda não foi migrada (ou o banco falha), o evento é apenas logado no
// stdout e o atendimento segue intacto. Segurança nunca derruba atendimento (RFC §P4).
//
// A evidência passa por redactPII + teto de tamanho: a trilha de segurança NÃO pode
// virar um novo repositório de dado pessoal (achado E-02 da auditoria).

import { prismaUnscoped } from "@/lib/prisma";
import { redactPII } from "@/lib/redact";
import { clampText } from "./sanitize";

export type SecurityRing = "admission" | "input" | "context" | "tool" | "egress" | "anomaly" | "auth";
export type SecuritySeverity = "info" | "low" | "medium" | "high" | "critical";
export type SecurityAction =
  | "observed"          // shadow: só registrou
  | "rigor"             // ligou grounding/verify neste turno
  | "toolset_reduced"   // removeu ferramentas de efeito externo
  | "contained"         // silenciou a IA no contato / escalou
  | "blocked"           // recusou a operação
  | "sanitized";        // removeu conteúdo (memória/egress)

export interface SecurityEventInput {
  clientId: string;
  contactId?: string | null;
  turnId?: string | null;
  ring: SecurityRing;
  control: string;       // "C-05", "C-11", ...
  severity: SecuritySeverity;
  score?: number | null;
  labels?: string[];
  action: SecurityAction;
  evidence?: string | null;
  shadow?: boolean;
}

const EVIDENCE_MAX = 500;

export async function emitSecurityEvent(e: SecurityEventInput): Promise<void> {
  const evidence = e.evidence ? clampText(redactPII(e.evidence) ?? "", EVIDENCE_MAX) : null;
  try {
    await prismaUnscoped.aiSecurityEvent.create({
      data: {
        clientId: e.clientId,
        contactId: e.contactId ?? null,
        turnId: e.turnId ?? null,
        ring: e.ring,
        control: e.control,
        severity: e.severity,
        score: e.score ?? null,
        labels: (e.labels?.length ? e.labels : undefined) as string[] | undefined,
        action: e.action,
        evidence,
        shadow: e.shadow ?? true,
      },
    });
  } catch {
    // Tabela ainda não migrada, banco fora, etc. — nunca propaga.
    try {
      console.warn("[security]", JSON.stringify({ ...e, evidence }));
    } catch { /* nem o log pode quebrar */ }
  }
}

// Versão fire-and-forget para os caminhos críticos (turno do agente, webhook).
export function emitSecurityEventAsync(e: SecurityEventInput): void {
  void emitSecurityEvent(e).catch(() => {});
}
