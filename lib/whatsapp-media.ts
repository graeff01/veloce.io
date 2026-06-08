import { decryptSecret } from "@/lib/crypto";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // 16MB — limite do WhatsApp
export const ALLOWED_AUDIO_MIME = new Set([
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/wav", "audio/webm",
]);

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// Baixa um media do WhatsApp (metadata → URL → bytes), com limites de mime/tamanho e
// timeouts. Só é chamado para ÁUDIO; imagem/documento nunca são baixados.
export async function downloadWhatsAppMedia(
  conn: { accessToken: string },
  mediaId: string,
  allowMime: Set<string>,
): Promise<{ bytes: Buffer; mime: string } | { error: string }> {
  const token = decryptSecret(conn.accessToken);
  const auth = { Authorization: `Bearer ${token}` };

  const metaRes = await fetchWithTimeout(`https://graph.facebook.com/v25.0/${mediaId}`, { headers: auth }, 10_000);
  if (!metaRes.ok) return { error: `meta ${metaRes.status}` };
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!meta.url) return { error: "sem url" };

  const mime = (meta.mime_type || "").split(";")[0].trim();
  if (!allowMime.has(mime)) return { error: `mime não permitido: ${mime}` };
  if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) return { error: "arquivo grande demais" };

  const binRes = await fetchWithTimeout(meta.url, { headers: auth }, 15_000);
  if (!binRes.ok) return { error: `download ${binRes.status}` };
  const buf = Buffer.from(await binRes.arrayBuffer());
  if (buf.byteLength > MAX_MEDIA_BYTES) return { error: "arquivo grande demais" };

  return { bytes: buf, mime };
}
