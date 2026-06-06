import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getAccessToken, getLeadTags, getContactTags, KommoError } from "@/lib/kommo";

// GET — lista todas as tags de lead da conta Kommo (para o usuário escolher
// quais representam anúncios). Retorna também as já marcadas como anúncio.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  try {
    const token = await getAccessToken(conn);
    // As tags de anúncio podem estar no lead ou no contato — junta as duas fontes.
    const [leadTags, contactTags] = await Promise.all([
      getLeadTags(conn, token),
      getContactTags(conn, token),
    ]);
    const names = [...new Set([...leadTags, ...contactTags].map((t) => t.name))];
    return NextResponse.json({
      tags: names.sort((a, b) => a.localeCompare(b, "pt-BR")),
      adTags: conn.adTags,
    });
  } catch (e) {
    if (e instanceof KommoError) {
      return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    }
    return NextResponse.json({ error: "Erro ao buscar tags do Kommo" }, { status: 500 });
  }
}
