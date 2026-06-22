import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { makeInviteToken } from "@/lib/notifications/client-bot";

export const runtime = "nodejs";

// POST — gera um link de convite (t.me/<bot>?start=token) para um papel.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const role = body?.role === "gestor" ? "gestor" : "corretor";
  const link = await makeInviteToken(id, role);
  if (!link) return NextResponse.json({ error: "Conecte o bot do cliente antes de convidar." }, { status: 400 });
  return NextResponse.json({ link });
}
