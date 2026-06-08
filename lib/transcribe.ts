import { downloadWhatsAppMedia, ALLOWED_AUDIO_MIME } from "@/lib/whatsapp-media";

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo"; // rápido e barato (~US$0,04/h)

function extFor(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("amr")) return "amr";
  return "ogg";
}

// Transcreve áudio (speech→text). NÃO interpreta, não extrai dados — só converte fala
// em texto, que segue pelo MESMO fluxo do agente. Retorna null em qualquer falha.
export async function transcribeAudio(bytes: Buffer, mime: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `audio.${extFor(mime)}`);
  form.append("model", MODEL);
  form.append("language", "pt");
  form.append("temperature", "0");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(GROQ_TRANSCRIBE_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    const text = (data.text || "").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Orquestra download (com limites) + transcrição. Usado pelo agente off-hours.
export async function transcribeWhatsAppAudio(conn: { accessToken: string }, mediaId: string, mime?: string): Promise<string | null> {
  void mime; // o mime real vem da metadata do download (validado contra a whitelist)
  const dl = await downloadWhatsAppMedia(conn, mediaId, ALLOWED_AUDIO_MIME);
  if ("error" in dl) return null;
  return transcribeAudio(dl.bytes, dl.mime);
}
