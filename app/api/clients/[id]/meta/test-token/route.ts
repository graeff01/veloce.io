import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const metaConn = await prisma.metaConnection.findUnique({ where: { clientId: id } });
  if (!metaConn) return NextResponse.json({ error: "Conexão Meta não configurada" }, { status: 404 });

  const waConn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!waConn) return NextResponse.json({ error: "Conexão WhatsApp não configurada" }, { status: 404 });

  const metaToken = decryptSecret(metaConn.accessToken);
  const waToken = decryptSecret(waConn.accessToken);

  // Testa ambos os tokens
  const testUrl = new URL(`https://graph.facebook.com/v21.0/${metaConn.adAccountId}`);
  testUrl.searchParams.append("fields", "name,currency,account_status");

  const metaRes = await fetch(testUrl.toString(), {
    headers: { Authorization: `Bearer ${metaToken}` },
  });
  const metaData = await metaRes.json();

  const waRes = await fetch(testUrl.toString(), {
    headers: { Authorization: `Bearer ${waToken}` },
  });
  const waData = await waRes.json();

  return NextResponse.json({
    adAccountId: metaConn.adAccountId,
    metaToken: {
      status: metaRes.status,
      ok: metaRes.ok,
      error: metaData.error ? { message: metaData.error.message, code: metaData.error.code } : null,
      data: metaData.error ? null : { name: metaData.name, currency: metaData.currency },
    },
    waToken: {
      status: waRes.status,
      ok: waRes.ok,
      error: waData.error ? { message: waData.error.message, code: waData.error.code } : null,
      data: waData.error ? null : { name: waData.name, currency: waData.currency },
    },
  });
}
