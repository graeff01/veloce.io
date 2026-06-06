import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { z } from "zod";

const saveSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  appSecret: z.string().optional(),
  displayPhone: z.string().optional(),
  name: z.string().optional(),
});

function safe(conn: { accessToken: string; appSecret: string | null }) {
  const { accessToken: _a, appSecret: _s, ...rest } = conn;
  return { ...rest, hasToken: true };
}

// GET — conexão (sem segredos) + contagens
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({
    where: { clientId: id },
    include: { _count: { select: { contacts: true, leads: true, messages: true } } },
  });
  if (!conn) return NextResponse.json(null);
  return NextResponse.json(safe(conn));
}

// POST — salva/atualiza credenciais do WhatsApp Cloud API
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = saveSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const conn = await prisma.waConnection.upsert({
    where: { clientId: id },
    create: {
      clientId: id,
      wabaId: d.wabaId.trim(),
      phoneNumberId: d.phoneNumberId.trim(),
      accessToken: encryptSecret(d.accessToken.trim()),
      appSecret: d.appSecret ? encryptSecret(d.appSecret.trim()) : null,
      displayPhone: d.displayPhone ?? null,
      name: d.name ?? null,
    },
    update: {
      wabaId: d.wabaId.trim(),
      phoneNumberId: d.phoneNumberId.trim(),
      accessToken: encryptSecret(d.accessToken.trim()),
      ...(d.appSecret ? { appSecret: encryptSecret(d.appSecret.trim()) } : {}),
      displayPhone: d.displayPhone ?? null,
      name: d.name ?? null,
    },
    include: { _count: { select: { contacts: true, leads: true, messages: true } } },
  });

  return NextResponse.json(safe(conn), { status: 201 });
}

// DELETE — remove conexão (e tudo em cascata)
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  await prisma.waConnection.deleteMany({ where: { clientId: id } });
  return NextResponse.json({ ok: true });
}
