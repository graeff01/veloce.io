// ── Nota de voz (TTS ElevenLabs) ─────────────────────────────────────────────
// Converte a resposta da IA em áudio (OGG/Opus) para enviar como NOTA DE VOZ no
// WhatsApp. O ElevenLabs entrega OGG/Opus direto (output_format=opus_48000_64) —
// exatamente o formato de nota de voz do WhatsApp, sem precisar de ffmpeg.
// Chave em ELEVENLABS_API_KEY; a voz por cliente vem de AiAgentConfig.voiceId.

const ELEVEN_MODEL = "eleven_multilingual_v2"; // português natural
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0.18, use_speaker_boost: true };

// Prepara o texto pra fala: tira emojis e marcadores que a voz leria estranho
// ("carinha", "🔥"...), colapsa espaços. Mantém a pontuação (vira ritmo/pausa).
export function prepForSpeech(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")                    // marcadores tipo [foto]
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}️]/gu, " ") // emojis
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Sintetiza a fala e devolve o buffer OGG/Opus (ou null se desligado/erro/vazio).
// Best-effort: qualquer falha vira null e o chamador segue com texto.
export async function synthesizeVoice(text: string, voiceId: string | null | undefined): Promise<Buffer | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  const clean = prepForSpeech(text || "");
  if (!key || !voiceId || !clean) return null;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=opus_48000_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, model_id: ELEVEN_MODEL, voice_settings: VOICE_SETTINGS }),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

// Decide se, nesta mensagem, a resposta deve ir em ÁUDIO conforme o modo configurado.
//  • on_audio: só quando o LEAD mandou áudio (responde no mesmo canal — natural).
//  • always: sempre.
//  • first:  só na 1ª mensagem (abertura).
export function shouldVoice(mode: string | null | undefined, opts: { inboundIsAudio: boolean; isFirstTurn: boolean }): boolean {
  switch (mode || "on_audio") {
    case "always": return true;
    case "first": return opts.isFirstTurn;
    case "on_audio":
    default: return opts.inboundIsAudio;
  }
}
