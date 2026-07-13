import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { downloadWhatsAppMedia, ALLOWED_MEDIA_MIME } from "@/lib/whatsapp-media";

export const runtime = "nodejs";

// Proxy de mídia RECEBIDA (o lead mandou foto/áudio/doc): a Meta só manda o ID no
// webhook — aqui baixamos com o token no servidor e devolvemos os bytes pro portal.
// Escopo: token→conexão→contato→mensagem (isolamento entre clientes).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; contactId: string; messageId: string }> }) {
  const { token, contactId, messageId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse("link inválido", { status: 404 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true, accessToken: true } });
  if (!conn) return new NextResponse("sem conexão", { status: 404 });

  const msg = await prisma.waMessage.findUnique({ where: { id: messageId }, select: { connectionId: true, contactId: true, type: true, raw: true } });
  if (!msg || msg.connectionId !== conn.id || msg.contactId !== contactId) return new NextResponse("não encontrado", { status: 404 });

  const raw = msg.raw as Record<string, { id?: string } | undefined> | null;
  const mediaId = raw?.[msg.type]?.id;
  if (!mediaId) return new NextResponse("sem mídia", { status: 404 });

  const result = await downloadWhatsAppMedia(conn, mediaId, ALLOWED_MEDIA_MIME);
  if ("error" in result) return new NextResponse(result.error, { status: 502 });

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: { "Content-Type": result.mime, "Cache-Control": "private, max-age=86400", "Content-Disposition": "inline" },
  });
}
