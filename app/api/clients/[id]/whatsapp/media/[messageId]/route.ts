import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { downloadWhatsAppMedia, ALLOWED_MEDIA_MIME } from "@/lib/whatsapp-media";

export const runtime = "nodejs";

// Proxy de mídia: entrega a imagem/áudio/vídeo/PDF de uma WaMessage ao operador.
// A Meta só manda o ID no webhook — aqui baixamos com o token (no servidor) e
// devolvemos os bytes. Nada vai para terceiros; é só exibição no espelho.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true, accessToken: true } });
  if (!conn) return new NextResponse("sem conexão", { status: 404 });

  const msg = await prisma.waMessage.findUnique({ where: { id: messageId }, select: { connectionId: true, type: true, raw: true } });
  if (!msg || msg.connectionId !== conn.id) return new NextResponse("não encontrado", { status: 404 });

  // O id da mídia está no objeto bruto da mensagem, sob a chave do tipo.
  const raw = msg.raw as Record<string, { id?: string } | undefined> | null;
  const mediaId = raw?.[msg.type]?.id;
  if (!mediaId) return new NextResponse("sem mídia", { status: 404 });

  const result = await downloadWhatsAppMedia(conn, mediaId, ALLOWED_MEDIA_MIME);
  if ("error" in result) return new NextResponse(result.error, { status: 502 });

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.mime,
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": "inline",
    },
  });
}
