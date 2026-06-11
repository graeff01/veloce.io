import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { checkMetaToken } from "@/lib/meta-token";
import { z } from "zod";

const saveSchema = z.object({
  adAccountId: z.string().min(1),
  accessToken: z.string().min(1),
});

// GET — retorna a conexão e os insights do mês atual (sem expor o accessToken)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.metaConnection.findUnique({
    where: { clientId: id },
    include: {
      insights: {
        orderBy: { spend: "desc" },
      },
    },
  });

  if (!conn) return NextResponse.json(null);

  // Saúde do token (best-effort — não bloqueia se a Meta estiver lenta)
  const token = await checkMetaToken(conn.accessToken).catch(() => null);
  const tokenStatus = token
    ? { valid: token.valid, type: token.type, isSystemUser: token.isSystemUser, expiresAt: token.expiresAt?.toISOString() ?? null }
    : null;

  // Nunca enviar o token ao cliente
  const { accessToken: _token, ...safe } = conn;
  return NextResponse.json({ ...safe, hasToken: true, tokenStatus });
}

// POST — salva/atualiza credenciais e verifica a conta
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json();
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { adAccountId, accessToken } = parsed.data;

  // Normaliza o ID da conta (aceita com ou sem "act_")
  const accountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  // Verifica a conta no Meta antes de salvar
  const verifyRes = await fetch(
    `https://graph.facebook.com/v21.0/${accountId}?fields=name,currency,account_status&access_token=${encodeURIComponent(accessToken)}`
  );
  const verifyData = await verifyRes.json();

  if (!verifyRes.ok || verifyData.error) {
    return NextResponse.json(
      { error: verifyData.error?.message ?? "Token ou ID de conta inválido" },
      { status: 400 }
    );
  }

  const encrypted = encryptSecret(accessToken);

  const conn = await prisma.metaConnection.upsert({
    where: { clientId: id },
    create: {
      clientId:    id,
      adAccountId: accountId,
      accessToken: encrypted,
      accountName: verifyData.name ?? null,
      currency:    verifyData.currency ?? "BRL",
    },
    update: {
      adAccountId: accountId,
      accessToken: encrypted,
      accountName: verifyData.name ?? null,
      currency:    verifyData.currency ?? "BRL",
    },
  });

  const { accessToken: _t, ...safe } = conn;
  return NextResponse.json({ ...safe, hasToken: true }, { status: 201 });
}

// DELETE — remove conexão e todos os insights
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  await prisma.metaConnection.deleteMany({ where: { clientId: id } });
  return NextResponse.json({ ok: true });
}
