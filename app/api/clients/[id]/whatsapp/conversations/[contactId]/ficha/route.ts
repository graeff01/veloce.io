import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { buildFicha } from "@/lib/ai-agent/ficha";

// Ficha do lead pronta pro WhatsApp (handoff pro vendedor).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const ficha = await buildFicha(id, contactId);
  if (!ficha) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  return NextResponse.json({ ficha });
}
