import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { verifyAccount, KommoError } from "@/lib/kommo";
import { z } from "zod";

const saveSchema = z.object({
  subdomain: z.string().min(1),
  accessToken: z.string().min(1),
  adTags: z.array(z.string()).optional(),
});

// Não expõe tokens ao cliente
function safe(conn: { accessToken: string; refreshToken: string | null; oauthClientId: string | null; oauthSecret: string | null }) {
  const { accessToken: _a, refreshToken: _r, oauthClientId: _c, oauthSecret: _s, ...rest } = conn;
  return { ...rest, hasToken: true };
}

// GET — conexão (sem token) + contagem de leads cacheados
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({
    where: { clientId: id },
    include: { _count: { select: { leads: true } } },
  });
  if (!conn) return NextResponse.json(null);

  return NextResponse.json(safe(conn));
}

// POST — salva/atualiza credenciais e verifica a conta no Kommo
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = saveSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  // Aceita domínio completo ou só o subdomínio
  const subdomain = parsed.data.subdomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\.kommo\.com.*$/, "")
    .replace(/\/.*$/, "");
  const accessToken = parsed.data.accessToken.trim();

  try {
    const accountName = await verifyAccount(subdomain, accessToken);

    const conn = await prisma.kommoConnection.upsert({
      where: { clientId: id },
      create: {
        clientId: id,
        subdomain,
        accessToken: encryptSecret(accessToken),
        accountName,
        adTags: parsed.data.adTags ?? [],
      },
      update: {
        subdomain,
        accessToken: encryptSecret(accessToken),
        accountName,
        ...(parsed.data.adTags ? { adTags: parsed.data.adTags } : {}),
      },
      include: { _count: { select: { leads: true } } },
    });

    return NextResponse.json(safe(conn), { status: 201 });
  } catch (e) {
    if (e instanceof KommoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Erro ao conectar ao Kommo" }, { status: 500 });
  }
}

// DELETE — remove conexão e leads cacheados
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  await prisma.kommoConnection.deleteMany({ where: { clientId: id } });
  return NextResponse.json({ ok: true });
}
