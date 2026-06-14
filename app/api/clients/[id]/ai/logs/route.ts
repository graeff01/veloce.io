import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// Logs técnicos por turno (grupo Operar). Mesma tabela do feed de Atividade
// (AiInteraction), expondo os campos técnicos crus + paginação por cursor.
// stages/guardrails/error e ms por tool call são instrumentados pelo orquestrador
// (migration 20260615130000). Turnos antigos sem esses campos caem no fallback.

type ToolCall = { name?: unknown; result?: unknown; ms?: unknown };
type Stage = { name?: unknown; ms?: unknown };
const FAIL_RE = /erro|error|falhou|não encontr|nao encontr|indispon|sem fonte/i;

function mapToolCalls(raw: unknown): { name: string; ok: boolean; ms: number | null }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ToolCall[]).map((t) => ({
    name: typeof t?.name === "string" ? t.name : "tool",
    ok: !(typeof t?.result === "string" && FAIL_RE.test(t.result)),
    ms: typeof t?.ms === "number" ? t.ms : null,
  }));
}

function mapStages(raw: unknown, latencyMs: number): { name: string; ms: number }[] {
  if (Array.isArray(raw) && raw.length) {
    return (raw as Stage[]).map((s) => ({ name: typeof s?.name === "string" ? s.name : "?", ms: typeof s?.ms === "number" ? s.ms : 0 }));
  }
  return latencyMs > 0 ? [{ name: "total", ms: latencyMs }] : []; // fallback p/ turnos antigos
}

function mapGuardrails(raw: unknown, status: string): string[] {
  if (Array.isArray(raw)) return (raw as unknown[]).filter((x): x is string => typeof x === "string");
  return status === "blocked" ? ["guardrail:tema_bloqueado"] : []; // fallback p/ turnos antigos
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") || 50)));
  const cursor = sp.get("cursor");

  const rows = await prisma.aiInteraction.findMany({
    where: { clientId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // +1 sentinela para saber se há próxima página
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, createdAt: true, contactId: true, decision: true, status: true,
      toolCalls: true, stages: true, guardrails: true, error: true,
      tokensIn: true, tokensOut: true, latencyMs: true,
      model: true, promptVariant: true, promptVersion: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    contactId: r.contactId,
    decision: r.decision,
    status: r.status,
    guardrails: mapGuardrails(r.guardrails, r.status),
    toolCalls: mapToolCalls(r.toolCalls),
    stages: mapStages(r.stages, r.latencyMs),
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    latencyMs: r.latencyMs,
    model: r.model,
    promptVariant: r.promptVariant,
    promptVersion: r.promptVersion,
    error: r.error,
  }));

  return NextResponse.json({ items, nextCursor: hasMore ? page[page.length - 1].id : null });
}
