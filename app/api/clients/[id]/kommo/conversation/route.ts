import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getAccessToken, getLeadNotes, getContactNotes, KommoError } from "@/lib/kommo";

// GET — conversa do lead. Junta notas do contato (fila de entrada) com as do
// lead no funil, quando houver. ?contactId=&leadId=
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  const url = new URL(req.url);
  const contactId = Number(url.searchParams.get("contactId"));
  const leadId = Number(url.searchParams.get("leadId"));

  try {
    const token = await getAccessToken(conn);
    const [contactNotes, leadNotes] = await Promise.all([
      Number.isFinite(contactId) ? getContactNotes(conn, token, contactId) : Promise.resolve([]),
      Number.isFinite(leadId) && leadId ? getLeadNotes(conn, token, leadId) : Promise.resolve([]),
    ]);

    const seen = new Set<number>();
    const items = [...contactNotes, ...leadNotes]
      .filter((n) => n.text && (seen.has(n.id) ? false : (seen.add(n.id), true)))
      .map((n) => ({ id: n.id, text: n.text, incoming: n.incoming, createdAt: n.createdAt, author: n.author }))
      .sort((a, b) => a.createdAt - b.createdAt);

    const kommoUrl = Number.isFinite(leadId) && leadId
      ? `https://${conn.subdomain}.kommo.com/leads/detail/${leadId}`
      : `https://${conn.subdomain}.kommo.com`;

    return NextResponse.json({ items, total: contactNotes.length + leadNotes.length, kommoUrl });
  } catch (e) {
    if (e instanceof KommoError) return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    return NextResponse.json({ error: "Erro ao buscar a conversa" }, { status: 500 });
  }
}
