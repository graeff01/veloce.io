import { prisma } from "@/lib/prisma";
import { downloadWhatsAppMedia, ALLOWED_MEDIA_MIME, ALLOWED_AUDIO_MIME } from "@/lib/whatsapp-media";
import { transcribeAudio } from "@/lib/transcribe";

// Persistência de mídia do WhatsApp. A Meta só retém o arquivo por um tempo; se o atendente
// só for ver depois, "expira" e some. Aqui baixamos UMA vez e guardamos os bytes (WaMedia),
// servindo daqui pra sempre. Para áudio, transcrevemos junto (Groq Whisper) — o atendente lê
// a nota de voz sem depender de tocar. Idempotente e silencioso (nunca quebra o webhook).

// Extrai o mediaId do objeto bruto da mensagem (a Meta guarda sob a chave do tipo).
export function mediaIdFromRaw(raw: unknown, type: string): string | null {
  const r = raw as Record<string, { id?: string } | undefined> | null;
  return r?.[type]?.id ?? null;
}

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker", "voice"]);

// Baixa e guarda a mídia de UMA mensagem. Chamado no webhook (fire-and-forget) e como
// backfill pelo proxy quando abre uma mensagem antiga ainda não persistida.
export async function persistWaMedia(
  conn: { accessToken: string },
  msg: { id: string; type: string; raw: unknown },
): Promise<{ ok: boolean }> {
  if (!MEDIA_TYPES.has(msg.type)) return { ok: false };
  const mediaId = mediaIdFromRaw(msg.raw, msg.type);
  if (!mediaId) return { ok: false };

  // Já persistida? (idempotente — o webhook pode reprocessar, o proxy pode correr em paralelo)
  const exists = await prisma.waMedia.findUnique({ where: { messageId: msg.id }, select: { messageId: true } }).catch(() => null);
  if (exists) return { ok: true };

  const dl = await downloadWhatsAppMedia(conn, mediaId, ALLOWED_MEDIA_MIME);
  if ("error" in dl) return { ok: false }; // silencioso; tenta de novo no próximo acesso

  let transcription: string | null = null;
  if ((msg.type === "audio" || msg.type === "voice") && ALLOWED_AUDIO_MIME.has(dl.mime)) {
    transcription = await transcribeAudio(dl.bytes, dl.mime).catch(() => null);
  }

  await prisma.waMedia.create({
    data: { messageId: msg.id, mime: dl.mime, data: new Uint8Array(dl.bytes), sizeBytes: dl.bytes.byteLength, transcription },
  }).catch(() => { /* corrida: outro processo já inseriu */ });
  return { ok: true };
}

// Backfill a partir de bytes JÁ baixados (o proxy acabou de buscar na Meta uma mensagem antiga
// ainda não persistida). Evita re-baixar; transcreve áudio de forma assíncrona. Fire-and-forget.
export async function storeMediaBytes(
  messageId: string,
  type: string,
  bytes: Buffer,
  mime: string,
): Promise<void> {
  const created = await prisma.waMedia.create({
    data: { messageId, mime, data: new Uint8Array(bytes), sizeBytes: bytes.byteLength },
  }).then(() => true).catch(() => false);
  if (!created) return; // já existia (corrida)
  if ((type === "audio" || type === "voice") && ALLOWED_AUDIO_MIME.has(mime)) {
    const t = await transcribeAudio(bytes, mime).catch(() => null);
    if (t) await prisma.waMedia.update({ where: { messageId }, data: { transcription: t } }).catch(() => {});
  }
}
