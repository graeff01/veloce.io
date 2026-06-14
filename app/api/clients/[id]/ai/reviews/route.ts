import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

// Revisão humana amostral (ground truth) — Sprint 4.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const items = await prismaUnscoped.humanReview.findMany({
    where: { clientId: id, status: "pending" }, orderBy: { createdAt: "asc" }, take: 20,
    select: { id: true, leadMessage: true, aiMessage: true, createdAt: true },
  });
  return NextResponse.json({ items });
}

const submitSchema = z.object({
  reviewId: z.string().min(1),
  goodResponse: z.boolean().optional(),
  natural: z.boolean().optional(),
  seemedBot: z.boolean().optional(),
  missedOpportunity: z.boolean().optional(),
  manualScore: z.number().int().min(0).max(10).optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;
  const parsed = submitSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;
  // Escopo por cliente: só atualiza review que pertence a este tenant.
  const r = await prismaUnscoped.humanReview.updateMany({
    where: { id: d.reviewId, clientId: id, status: "pending" },
    data: {
      status: "done", goodResponse: d.goodResponse, natural: d.natural, seemedBot: d.seemedBot,
      missedOpportunity: d.missedOpportunity, manualScore: d.manualScore, notes: d.notes,
      reviewerId: session?.user?.id ?? null, reviewedAt: new Date(),
    },
  });
  if (r.count === 0) return NextResponse.json({ error: "Revisão não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
