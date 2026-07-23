import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";
import { invalidateBlocklistCache } from "@/lib/ai-agent/blocklist";
import { onlyDigits, sameBrazilNumber } from "@/lib/phone-br";
import { z } from "zod";

// Lista GLOBAL de números que a IA nunca responde (donos, colaboradores...).
// Vale para TODOS os clientes ativos. Gerenciada na aba IA do painel.

const createSchema = z.object({
  phone: z.string().min(1).max(30),
  label: z.string().max(80).optional(),
});

// GET — lista todos os números bloqueados (mais recentes primeiro).
export async function GET() {
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const items = await prisma.aiBlockedNumber.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, phone: true, label: true, createdBy: true, createdAt: true },
  });
  return NextResponse.json(items);
}

// POST — cadastra um número. Normaliza para dígitos; recusa duplicado tolerando o 9º dígito.
export async function POST(req: Request) {
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const phone = onlyDigits(parsed.data.phone);
  if (phone.length < 8) {
    return NextResponse.json({ error: "Número inválido" }, { status: 400 });
  }
  const label = parsed.data.label?.trim() || null;

  // Dedupe tolerante ao 9º dígito: se já existe o mesmo número BR, não duplica.
  const existing = await prisma.aiBlockedNumber.findMany({ select: { id: true, phone: true } });
  if (existing.some((e) => sameBrazilNumber(e.phone, phone))) {
    return NextResponse.json({ error: "Número já está na lista" }, { status: 409 });
  }

  const item = await prisma.aiBlockedNumber.create({
    data: { phone, label, createdBy: session.user.email ?? null },
    select: { id: true, phone: true, label: true, createdBy: true, createdAt: true },
  });
  invalidateBlocklistCache();
  await recordAudit({ userId: session.user.id, action: "ai.blocklist.add", target: phone, meta: { label } });

  return NextResponse.json(item, { status: 201 });
}

// DELETE — remove um número da lista (?id=...).
export async function DELETE(req: Request) {
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const item = await prisma.aiBlockedNumber.findUnique({ where: { id }, select: { phone: true } });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.aiBlockedNumber.delete({ where: { id } });
  invalidateBlocklistCache();
  await recordAudit({ userId: session.user.id, action: "ai.blocklist.remove", target: item.phone });

  return NextResponse.json({ ok: true });
}
