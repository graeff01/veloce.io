import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idsDasConexoes, filtroConexoes } from "@/lib/wa-connections";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto por chamada. A JR tem ~1.250 conversas sem dono: o objetivo aqui é a
// vendedora limpar a caixa em lotes, não varrer a base inteira num clique — que
// seria irreversível pelo app e pesado no banco.
const TETO = 100;

// POST { contactIds: string[] } — ASSUME para si as conversas indicadas.
//
// Deliberadamente NÃO transfere e NÃO remove dono: essas são operações de admin
// e continuam uma a uma, na rota de assign individual, onde a trava de papel
// já existe. Aqui só existe o caso seguro — pegar lead livre para mim.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;

  const me = portal.email;
  if (!me) return NextResponse.json({ error: "Faça login para assumir conversas." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const brutos = Array.isArray(body?.contactIds) ? body.contactIds : [];
  const ids: string[] = [...new Set<string>(brutos.filter((v: unknown): v is string => typeof v === "string" && v.length > 0))];
  if (ids.length === 0) return NextResponse.json({ error: "Nenhuma conversa indicada." }, { status: 400 });
  if (ids.length > TETO) return NextResponse.json({ error: `Máximo de ${TETO} conversas por vez.` }, { status: 400 });

  // Só as conversas DESTE cliente: o id do contato vem do aparelho e não é prova
  // de nada. A conexão é a fronteira do tenant.
  const connIds = await idsDasConexoes(portal.clientId);
  if (connIds.length === 0) return NextResponse.json({ error: "Sem conexão de WhatsApp." }, { status: 404 });
  const conn = { id: filtroConexoes(connIds) }; // vale para qualquer número do cliente

  // E só as LIVRES (sem dono, ou já minhas). Lead de outra vendedora não é
  // tocado — e o número de ignoradas volta para a tela poder dizer isso.
  const r = await prisma.waConversation.updateMany({
    where: {
      connectionId: conn.id,
      contactId: { in: ids },
      OR: [{ assignedEmail: null }, { assignedEmail: me }],
    },
    data: { assignedEmail: me, assignedAt: new Date() },
  });

  return NextResponse.json({ ok: true, assumidas: r.count, ignoradas: ids.length - r.count });
}
