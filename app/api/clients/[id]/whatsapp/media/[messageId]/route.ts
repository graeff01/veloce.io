import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClientAccess } from "@/lib/api-helpers";
import { downloadWhatsAppMedia, ALLOWED_MEDIA_MIME } from "@/lib/whatsapp-media";
import { mediaIdFromRaw, storeMediaBytes } from "@/lib/wa-media-store";

export const runtime = "nodejs";

const HEADERS = (mime: string) => ({
  "Content-Type": mime,
  // imutável: a mídia persistida nunca muda → o navegador cacheia forte (some o "recarrega toda hora").
  "Cache-Control": "private, max-age=31536000, immutable",
  "Content-Disposition": "inline",
});

// Proxy de mídia: entrega a imagem/áudio/vídeo/PDF de uma WaMessage ao operador.
// PRIMEIRO serve do banco (WaMedia, persistido no webhook — permanente e instantâneo).
// Só cai pro download on-demand da Meta se ainda não foi persistido (mensagem antiga),
// e nesse caso faz backfill pro banco pra nunca mais expirar. Nada vai para terceiros.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const { error } = await requireClientAccess(id);
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true, accessToken: true } });
  if (!conn) return new NextResponse("sem conexão", { status: 404 });

  const msg = await prisma.waMessage.findUnique({ where: { id: messageId }, select: { connectionId: true, type: true, raw: true, media: { select: { mime: true, data: true } } } });
  if (!msg || msg.connectionId !== conn.id) return new NextResponse("não encontrado", { status: 404 });

  // 1) Já persistido → serve do banco (permanente, rápido).
  if (msg.media) {
    return new NextResponse(new Uint8Array(msg.media.data), { status: 200, headers: HEADERS(msg.media.mime) });
  }

  // 2) Ainda não persistido (mensagem antiga) → baixa da Meta e faz backfill.
  const mediaId = mediaIdFromRaw(msg.raw, msg.type);
  if (!mediaId) return new NextResponse("sem mídia", { status: 404 });
  const result = await downloadWhatsAppMedia(conn, mediaId, ALLOWED_MEDIA_MIME);
  if ("error" in result) return new NextResponse(result.error, { status: 502 });
  void storeMediaBytes(messageId, msg.type, result.bytes, result.mime).catch(() => {}); // backfill p/ próxima vez
  return new NextResponse(new Uint8Array(result.bytes), { status: 200, headers: HEADERS(result.mime) });
}
