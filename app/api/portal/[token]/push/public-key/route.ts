import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — chave pública VAPID para o navegador do vendedor se inscrever no push. Pública por design.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const key = process.env.VAPID_PUBLIC_KEY ?? null;
  return NextResponse.json({ publicKey: key, available: !!key });
}
