import { prisma } from "@/lib/prisma";

// Tipos de evento da operação (observabilidade/auditoria).
export type WaEventType =
  | "lead.created"
  | "message.in"
  | "first.response"
  | "status.changed"
  | "funnel.changed"
  | "funnel.auto"
  | "report.validity"
  | "ai.silenced"
  | "ai.erased"
  | "ai.reengaged"
  | "integration.error";

// Registra um evento. Nunca lança — observabilidade não pode quebrar o fluxo.
export async function logWaEvent(
  connectionId: string | null,
  type: WaEventType,
  refId?: string | null,
  data?: object,
): Promise<void> {
  try {
    await prisma.waEvent.create({
      data: { connectionId: connectionId ?? null, type, refId: refId ?? null, data: data ?? undefined },
    });
  } catch {
    // silencioso de propósito
  }
}
