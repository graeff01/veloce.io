// ── Naturalidade (F3) ────────────────────────────────────────────────────────
// Tira o "cheiro de robô": (1) detecta o sentimento do lead para a IA ajustar o tom
// (empatia quando irritado, energia quando animado); (2) quebra a resposta em várias
// mensagens curtas, como uma pessoa digitando no WhatsApp — em vez de um textão.
// Funções puras (fáceis de testar); o disparo é gated por AiAgentConfig.humanize.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Sentiment = "irritado" | "animado" | "neutro";

const NEG = ["absurdo", "ridiculo", "pessimo", "horrivel", "palhacada", "descaso", "revoltado", "demora", "demorou", "cade", "ninguem responde", "ninguem respondeu", "enrola", "enrolacao", "cancelar", "reclamacao", "processar", "nao aguento"];
const POS = ["amei", "adorei", "otimo", "perfeito", "maravilha", "maravilhoso", "show", "top", "quero muito", "ansioso", "ansiosa", "incrivel", "sensacional", "gratidao", "obrigado demais"];

export function detectSentiment(text: string): Sentiment {
  const t = norm(text);
  let neg = NEG.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const pos = POS.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  // Excesso de pontuação/caixa alta reforça irritação.
  if (/!{2,}/.test(text) || (text.length > 12 && text === text.toUpperCase() && /[A-ZÀ-Ú]/.test(text))) neg += 1;
  if (neg > pos && neg > 0) return "irritado";
  if (pos > neg && pos > 0) return "animado";
  return "neutro";
}

export function sentimentHint(s: Sentiment): string {
  if (s === "irritado") return "O lead parece INSATISFEITO/impaciente. Seja especialmente empático e objetivo, reconheça o incômodo e resolva rápido; se não puder, escale a um vendedor.";
  if (s === "animado") return "O lead parece ANIMADO. Acompanhe a energia (sem exagero) e conduza para o próximo passo.";
  return "";
}

// Quebra a resposta em mensagens curtas e naturais. Respeita parágrafos; parágrafos
// longos são divididos por frases. Limita a quantidade para não parecer spam.
export function splitIntoMessages(text: string, opts?: { maxLen?: number; maxParts?: number }): string[] {
  const maxLen = opts?.maxLen ?? 280;
  const maxParts = opts?.maxParts ?? 4;
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const parts: string[] = [];
  for (const p of paras) {
    if (p.length <= maxLen) { parts.push(p); continue; }
    // Quebra por frases, agrupando até o limite.
    const sentences = p.split(/(?<=[.!?…])\s+/);
    let buf = "";
    for (const s of sentences) {
      if ((buf + " " + s).trim().length > maxLen && buf) { parts.push(buf.trim()); buf = s; }
      else buf = (buf ? `${buf} ${s}` : s);
    }
    if (buf.trim()) parts.push(buf.trim());
  }

  // Colapsa o excedente na última mensagem (evita rajada longa demais).
  if (parts.length > maxParts) {
    const head = parts.slice(0, maxParts - 1);
    const tail = parts.slice(maxParts - 1).join("\n\n");
    return [...head, tail];
  }
  return parts.length ? parts : [text.trim()];
}
