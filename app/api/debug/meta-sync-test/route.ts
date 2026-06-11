import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  console.log("[DEBUG] Starting meta/sync test", { clientId });

  // Teste 1: Verificar requireAuth
  console.log("[DEBUG] Testing requireAuth...");
  const auth = await requireAuth("clients:update");
  console.log("[DEBUG] Auth result:", { hasError: !!auth.error, session: auth.session?.user });

  if (auth.error) {
    console.log("[DEBUG] Auth error detected, returning early");
    return auth.error;
  }

  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  try {
    // Teste 2: Verificar conexão Meta
    console.log("[DEBUG] Fetching meta connection...", { clientId });
    const conn = await prisma.metaConnection.findUnique({ where: { clientId } });
    console.log("[DEBUG] Connection found:", { id: conn?.id, adAccountId: conn?.adAccountId, hasToken: !!conn?.accessToken });

    if (!conn) {
      return NextResponse.json({ error: "Conexão Meta não configurada" }, { status: 404 });
    }

    // Teste 3: Verificar descriptografia do token
    console.log("[DEBUG] Attempting token decryption...");
    const accessToken = decryptSecret(conn.accessToken);
    const tokenPreview = accessToken.substring(0, 20) + "...";
    console.log("[DEBUG] Token decrypted successfully", { preview: tokenPreview });

    // Teste 4: Fazer requisição à Meta
    console.log("[DEBUG] Making Meta API request...");
    const url = new URL(`https://graph.facebook.com/v21.0/${conn.adAccountId}`);
    url.searchParams.set("fields", "name,currency");
    url.searchParams.set("access_token", accessToken);

    const metaRes = await fetch(url.toString());
    const metaData = await metaRes.json();

    console.log("[DEBUG] Meta API response:", {
      status: metaRes.status,
      ok: metaRes.ok,
      hasError: !!metaData.error,
      errorCode: metaData.error?.code,
      errorType: metaData.error?.type,
      errorMessage: metaData.error?.message,
    });

    return NextResponse.json({
      success: true,
      auth: { hasSession: !!auth.session },
      connection: { id: conn.id, adAccountId: conn.adAccountId },
      token: { decrypted: true, preview: tokenPreview },
      meta: {
        status: metaRes.status,
        ok: metaRes.ok,
        error: metaData.error ? { code: metaData.error.code, message: metaData.error.message } : null,
        data: metaData.error ? null : { name: metaData.name, currency: metaData.currency },
      },
    });
  } catch (e) {
    console.error("[DEBUG] Error during test:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error", stack: e instanceof Error ? e.stack : undefined },
      { status: 500 }
    );
  }
}
