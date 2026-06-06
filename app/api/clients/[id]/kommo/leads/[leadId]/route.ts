import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getAccessToken, getLeadNotes, KommoError } from "@/lib/kommo";

// GET — conversa/timeline de um lead (notas e mensagens expostas pela API).
// leadId = id do lead no Kommo (kommoId).
export async function GET(_: Request, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  const { id, leadId } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  const kommoId = Number(leadId);
  if (!Number.isFinite(kommoId)) return NextResponse.json({ error: "Lead inválido" }, { status: 400 });

  try {
    const token = await getAccessToken(conn);
    const notes = await getLeadNotes(conn, token, kommoId);
    // Só itens com texto legível (mensagens / anotações); ordena por data
    const items = notes
      .filter((n) => n.text)
      .map((n) => ({ id: n.id, text: n.text, incoming: n.incoming, createdAt: n.createdAt, author: n.author }))
      .sort((a, b) => a.createdAt - b.createdAt);
    return NextResponse.json({ items, total: notes.length });
  } catch (e) {
    if (e instanceof KommoError) {
      return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    }
    return NextResponse.json({ error: "Erro ao buscar a conversa" }, { status: 500 });
  }
}
