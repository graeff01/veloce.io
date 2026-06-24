import { gatherAdSignals } from "@/lib/ad-conversation-intel";
import { detectAdModel } from "@/lib/wa-ad-detect";
import { groqChat, extractJson } from "@/lib/groq";

// ── Gerador do PRÓXIMO anúncio ───────────────────────────────────────────────
// A IA entrega o material pronto pra equipe PRODUZIR (não gera imagem/vídeo):
// copy, headlines, texto, CTA, ângulo de oferta e roteiro de vídeo — tudo
// ancorado no que os leads REAIS daquele anúncio perguntam. Sem achismo de preço.

export interface GeneratedAd {
  modelo: string | null;
  anguloOferta: string;
  headlines: string[];
  textoPrincipal: string;
  cta: string;
  roteiro: { cena: string; fala: string; imagem: string }[];
  dica: string;
}
export interface GenerateResult {
  basedOn: { leadCount: number; topThemes: { label: string; pct: number }[] };
  generated: GeneratedAd | null;
  error?: string;
}

function guessModel(adName: string | null, openers: string[]): string | null {
  for (const o of openers) { const m = detectAdModel(o); if (m) return m; }
  if (adName) {
    const parts = adName.replace(/^AD[-_ ]?/i, "").split(/[-_ ]+/).filter(Boolean);
    if (parts[0] && !/^v?\d+$/i.test(parts[0])) return parts[0];
  }
  return null;
}

export async function generateNextAd(
  clientId: string,
  opts: { adId?: string | null; adName?: string | null; modelo?: string | null },
  start: Date,
  end: Date,
): Promise<GenerateResult> {
  const sig = await gatherAdSignals(clientId, { adId: opts.adId }, start, end);
  const basedOn = { leadCount: sig.leadCount, topThemes: sig.intents.slice(0, 5).map((i) => ({ label: i.label, pct: i.pct })) };

  if (!process.env.GROQ_API_KEY) {
    return { basedOn, generated: null, error: "IA não configurada (GROQ_API_KEY ausente)." };
  }

  const modelo = opts.modelo || guessModel(opts.adName ?? null, sig.topOpeners);
  const system =
    "Você é redator sênior de tráfego de revenda de veículos. Com base no que os leads REAIS perguntam e no veículo, escreva o material do PRÓXIMO anúncio Click-to-WhatsApp, pronto para a EQUIPE produzir — você NÃO gera imagem nem vídeo, só o material. Responda SOMENTE com um JSON: { \"anguloOferta\": string, \"headlines\": [3 strings curtas e fortes], \"textoPrincipal\": string (2 a 4 linhas), \"cta\": string, \"roteiro\": [4 a 6 itens { \"cena\": string, \"fala\": string, \"imagem\": string }], \"dica\": string }. Português do Brasil, persuasivo e honesto. Foque no que o comprador real pergunta. NÃO invente preço, parcela ou condição específica que não foi informada — fale em termos genéricos (ex.: 'condição facilitada', 'simulação na hora').";
  const user = [
    `Veículo: ${modelo ?? "(não identificado — escreva de forma adaptável)"}.`,
    `O que os ${sig.leadCount} leads reais mais perguntam: ${sig.intents.slice(0, 6).map((i) => `${i.label} ${i.pct}%`).join(", ") || "sem dados suficientes"}.`,
    sig.topOpeners.length ? `Exemplos de como os leads abrem a conversa: ${sig.topOpeners.slice(0, 10).join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  try {
    const raw = await groqChat(system, user, 760);
    const p = extractJson<Partial<GeneratedAd>>(raw);
    if (!p || !Array.isArray(p.headlines) || p.headlines.length === 0) {
      return { basedOn, generated: null, error: "A IA não retornou um anúncio válido. Tente novamente." };
    }
    return {
      basedOn,
      generated: {
        modelo: modelo ?? null,
        anguloOferta: p.anguloOferta?.trim() || "",
        headlines: p.headlines.map((h) => String(h).trim()).filter(Boolean).slice(0, 4),
        textoPrincipal: p.textoPrincipal?.trim() || "",
        cta: p.cta?.trim() || "Falar no WhatsApp",
        roteiro: Array.isArray(p.roteiro)
          ? p.roteiro.slice(0, 6).map((r) => ({ cena: String(r?.cena ?? "").trim(), fala: String(r?.fala ?? "").trim(), imagem: String(r?.imagem ?? "").trim() }))
          : [],
        dica: p.dica?.trim() || "",
      },
    };
  } catch {
    return { basedOn, generated: null, error: "Falha ao gerar com a IA. Tente novamente." };
  }
}
