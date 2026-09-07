import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TETO_NOTA = 500;

// POST { messageId, note } — "a IA errou AQUI".
//
// Até agora, AiCorrection só nascia quando alguém REJEITAVA um orçamento. Mas
// quem vê a IA errar em tempo real é a vendedora, dentro da conversa — e ela não
// tinha como registrar. O ciclo de aprendizado ficava cego para tudo que não
// fosse preço.
//
// Seção "conversas", não "aprendizado", DE PROPÓSITO: exigir a seção do relatório
// barraria exatamente a pessoa que presencia o erro. Ler as correções continua
// sendo outra permissão.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;

  const me = portal.email;
  if (!me) return NextResponse.json({ error: "Faça login para relatar." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, TETO_NOTA) : "";
  if (!messageId) return NextResponse.json({ error: "Mensagem não indicada." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Diga o que a IA errou." }, { status: 400 });

  // Isolamento: a mensagem tem que ser DESTA conversa e de uma conexão DESTE
  // cliente. O id vem do aparelho e não prova nada sozinho.
  const msg = await prisma.waMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true, contactId: true, text: true, timestamp: true, direction: true, aiGenerated: true,
      connection: { select: { clientId: true } },
    },
  });
  if (!msg || msg.contactId !== contactId || msg.connection.clientId !== portal.clientId) {
    return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });
  }
  if (msg.direction !== "out" || !msg.aiGenerated) {
    return NextResponse.json({ error: "Só dá para corrigir uma resposta da IA." }, { status: 400 });
  }

  // Mesma mensagem relatada duas vezes vira um relato só: a segunda pessoa
  // acrescenta contexto em vez de criar ruído na fila de aprendizado.
  const ja = await prisma.aiCorrection.findFirst({
    where: { clientId: portal.clientId, contactId, kind: "manual", aiProposed: msg.text ?? undefined, resolved: false },
    select: { id: true, note: true },
  });
  if (ja) {
    const juntas = [ja.note, `${me}: ${note}`].filter(Boolean).join("\n").slice(0, TETO_NOTA * 2);
    await prisma.aiCorrection.update({ where: { id: ja.id }, data: { note: juntas } });
    return NextResponse.json({ ok: true, novo: false });
  }

  // O que o lead tinha acabado de pedir — sem isso a correção chega sem contexto
  // e quem for ajustar o prompt não sabe a que ela responde.
  const pergunta = await prisma.waMessage.findFirst({
    where: { contactId, direction: "in", timestamp: { lt: msg.timestamp } },
    orderBy: { timestamp: "desc" },
    select: { text: true },
  });

  await prisma.aiCorrection.create({
    data: {
      clientId: portal.clientId,
      contactId,
      kind: "manual",
      leadWanted: pergunta?.text ?? null,
      aiProposed: msg.text ?? null,
      note,
      reviewerEmail: me,
    },
  });
  return NextResponse.json({ ok: true, novo: true });
}
