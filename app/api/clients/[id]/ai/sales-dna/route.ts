import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";
import { distillSalesDna, winningStats } from "@/lib/ai-agent/sales-dna";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — estado do DNA de venda + quantas vendas há pra aprender (por vendedor).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const cfg = await prisma.aiAgentConfig.findUnique({
    where: { clientId: id },
    select: { salesDna: true, salesDnaEnabled: true, salesDnaAt: true },
  });
  const stats = await winningStats(id);
  return NextResponse.json({
    salesDna: cfg?.salesDna ?? null,
    salesDnaEnabled: cfg?.salesDnaEnabled ?? false,
    salesDnaAt: cfg?.salesDnaAt ?? null,
    stats,
  });
}

// POST — destila o DNA a partir das conversas que fecharam (não liga sozinho).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const res = await distillSalesDna(id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });

  await recordAudit({ userId: session!.user.id, action: "ai.salesDna.distill", clientId: id, meta: { conversationsUsed: res.used } }).catch(() => {});
  return NextResponse.json({ ok: true, salesDna: res.dna, conversationsUsed: res.used });
}

// PATCH — liga/desliga o DNA no atendimento, ou edita o texto do DNA.
const patchSchema = z.object({
  salesDnaEnabled: z.boolean().optional(),
  salesDna: z.string().max(8000).nullable().optional(),
});
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  await prisma.aiAgentConfig.update({ where: { clientId: id }, data: parsed.data });
  await recordAudit({ userId: session!.user.id, action: "ai.salesDna.update", clientId: id, meta: parsed.data as Record<string, unknown> }).catch(() => {});
  return NextResponse.json({ ok: true });
}
