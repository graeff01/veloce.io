import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal, rateIdentity } from "@/lib/portal-guard";

export const runtime = "nodejs";

// Estado COMPARTILHADO da conversa: lida e arquivada.
//
// Compartilhado pela equipe, não por pessoa: a caixa é de um número só, atendido
// por várias vendedoras. Guardar leitura por usuário faria cada uma ver um
// contador diferente da mesma fila — que é justamente o que confunde.
//
// ADITIVA: rota nova. O PWA não a chama e segue idêntico.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string; contactId: string }> },
) {
  const { token, contactId } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as { lida?: boolean; arquivada?: boolean };

  // O contato precisa ser DESTE cliente — isolamento não depende da UI.
  const conn = await prisma.waConnection.findFirst({
    where: { clientId: portal.clientId },
    select: { id: true },
  });
  if (!conn) return NextResponse.json({ error: "Sem conexão de WhatsApp." }, { status: 404 });

  const conversa = await prisma.waConversation.findFirst({
    where: { contactId, connectionId: conn.id },
    select: { id: true },
  });
  if (!conversa) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const agora = new Date();
  const dados: Record<string, unknown> = {};
  if (typeof body.lida === "boolean") {
    dados.portalReadAt = body.lida ? agora : null;
    dados.portalReadBy = body.lida ? portal.email : null;
  }
  if (typeof body.arquivada === "boolean") {
    dados.portalArchivedAt = body.arquivada ? agora : null;
  }
  if (Object.keys(dados).length === 0) {
    return NextResponse.json({ error: "Nada a alterar." }, { status: 400 });
  }

  const atualizada = await prisma.waConversation.update({
    where: { id: conversa.id },
    data: dados,
    select: { portalReadAt: true, portalReadBy: true, portalArchivedAt: true },
  });

  return NextResponse.json({
    lida: atualizada.portalReadAt !== null,
    lidaPor: atualizada.portalReadBy,
    arquivada: atualizada.portalArchivedAt !== null,
  });
}

// `rateIdentity` é importada para manter o mesmo perfil de cota das demais
// rotas do portal; `guardPortal` já a aplica internamente.
void rateIdentity;
