import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

// Tabela de preços por cliente (F2). A IA COLETA; este motor CALCULA — o preço nunca
// sai do modelo. Aqui o operador edita base/opcionais/taxas sem tocar no banco.
const itemSchema = z.object({ key: z.string().min(1).max(40), label: z.string().min(1).max(120), amount: z.number() });
const feeSchema = z.object({ key: z.string().min(1).max(40), label: z.string().min(1).max(120), amount: z.number().optional(), percent: z.number().optional() });
const rulesSchema = z.object({
  base: z.array(itemSchema).optional(),
  options: z.array(itemSchema).optional(),
  fees: z.array(feeSchema).optional(),
});
const putSchema = z.object({ currency: z.string().max(8).optional(), rules: rulesSchema });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const pc = await prisma.pricingConfig.findUnique({ where: { clientId: id } });
  return NextResponse.json(pc ?? { clientId: id, currency: "BRL", rules: { base: [], options: [], fees: [] } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { currency, rules } = parsed.data;

  const pc = await prisma.pricingConfig.upsert({
    where: { clientId: id },
    create: { clientId: id, currency: currency ?? "BRL", rules },
    update: { ...(currency ? { currency } : {}), rules },
  });
  return NextResponse.json(pc);
}
