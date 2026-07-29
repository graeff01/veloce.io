import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { downloadWhatsAppMedia, ALLOWED_MEDIA_MIME } from "@/lib/whatsapp-media";
import { mediaIdFromRaw, storeMediaBytes } from "@/lib/wa-media-store";

export const runtime = "nodejs";

const HEADERS = (mime: string) => ({
  "Content-Type": mime,
  "Cache-Control": "private, max-age=31536000, immutable",
  "Content-Disposition": "inline",
});

// Proxy de mídia RECEBIDA (o lead mandou foto/áudio/doc). PRIMEIRO serve do banco (WaMedia,
// persistido no webhook — permanente). Só baixa da Meta se ainda não foi persistido (mensagem
// antiga), e nesse caso faz backfill. Escopo: token→conexão→contato→mensagem (isolamento).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; contactId: string; messageId: string }> }) {
  const { token, contactId, messageId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse("link inválido", { status: 404 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true, accessToken: true } });
  if (!conn) return new NextResponse("sem conexão", { status: 404 });

  const msg = await prisma.waMessage.findUnique({ where: { id: messageId }, select: { connectionId: true, contactId: true, type: true, raw: true, media: { select: { mime: true, data: true } } } });
  if (!msg || msg.connectionId !== conn.id || msg.contactId !== contactId) return new NextResponse("não encontrado", { status: 404 });

  if (msg.media) {
    return new NextResponse(new Uint8Array(msg.media.data), { status: 200, headers: HEADERS(msg.media.mime) });
  }

  const mediaId = mediaIdFromRaw(msg.raw, msg.type);
  if (!mediaId) return new NextResponse("sem mídia", { status: 404 });
  const result = await downloadWhatsAppMedia(conn, mediaId, ALLOWED_MEDIA_MIME);
  if ("error" in result) return new NextResponse(result.error, { status: 502 });
  void storeMediaBytes(messageId, msg.type, result.bytes, result.mime).catch(() => {});
  return new NextResponse(new Uint8Array(result.bytes), { status: 200, headers: HEADERS(result.mime) });
}
