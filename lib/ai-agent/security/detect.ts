// ── Camada de segurança · Anel 1: detector determinístico de injeção/jailbreak ──
// Classe A: NÃO bloqueia nada por si só e NÃO altera o texto. Produz score+rótulos
// que alimentam a política graduada (policy.ts) e a telemetria (AiSecurityEvent).
//
// Regra de projeto (RFC §P2): ZERO chamada de LLM. Um detector que pode ser
// convencido não é um controle de segurança.
//
// Módulo PURO — testável em tests/security-detect.test.ts.

import { securityShadow, collapseSpacedLetters, decodeEmbedded, invisibleReport } from "./sanitize";

export interface DetectionResult {
  score: number;      // 0..1
  labels: string[];   // rótulos das famílias acionadas
  matched: string[];  // trechos que casaram (curtos, p/ evidência redigida)
}

interface Rule { label: string; weight: number; re: RegExp }

// Famílias de sinal. Pesos calibrados para que UM sinal isolado fique em "observar"
// e a combinação de dois suba de faixa — texto legítimo raramente casa duas famílias.
const RULES: Rule[] = [
  // 1) Sobrescrita de instrução
  // Verbo de anulação seguido, a curta distância, do alvo (instrução/regra/prompt).
  // A distância tolerante cobre "ignore TODAS AS instruções", "esqueça as suas regras".
  { label: "override", weight: 0.45, re: /\b(ignor[ae]|ignorem|esque[cç]a|esque[cç]am|desconsider[ae]|apague|anule)\b[^.!?\n]{0,40}?\b(instru|regras?|ordens?|orienta|prompt|comandos?)/ },
  { label: "override", weight: 0.4, re: /\b(ignor[ae]|esque[cç]a|desconsider[ae])\b[^.!?\n]{0,20}?\b(o\s+que\s+(foi|te)\s+dit|tudo\s+(o\s+)?que|acima|anterior)/ },
  { label: "override", weight: 0.45, re: /\b(a\s+partir\s+de\s+agora|de\s+agora\s+em\s+diante|daqui\s+pra\s+frente)\s+(voce|vc|tu)\s+(e|sera|vai\s+ser|deve|passa\s+a)/ },
  { label: "override", weight: 0.4, re: /\b(nova|novas|atualiza(cao|da)|substitu[ai])\s+(regra|instru|politica|diretriz|configura)/ },
  { label: "override", weight: 0.35, re: /\b(voce|vc)\s+(agora\s+)?(e|sera|deve\s+ser)\s+(um|uma|o|a)\s+\w+/ },

  // 2) Falsificação de papel / contrabando estrutural
  { label: "role_spoof", weight: 0.5, re: /(^|\n)\s*(system|sistema|assistant|assistente|developer|user)\s*:\s*\S/ },
  { label: "role_spoof", weight: 0.6, re: /<\|?(im_start|im_end|system|endoftext)\|?>|\[\/?INST\]|<\|start_header_id\|>/ },
  { label: "role_spoof", weight: 0.45, re: /###\s*(instruction|system|prompt|regras?)\b/ },
  { label: "role_spoof", weight: 0.4, re: /"role"\s*:\s*"(system|assistant|developer)"/ },

  // 3) Extração de prompt/ferramentas
  { label: "extraction", weight: 0.5, re: /\b(repita|imprima|mostre|revele|liste|qual\s+e|quais\s+sao|me\s+(diga|mostre))\s+(as\s+|o\s+|seu\s+|suas\s+|sua\s+)?(prompt|system\s*prompt|instru[cç]|regras?\s+(internas|do\s+sistema|absolutas)|configura[cç]|ferramentas?|tools?|fun[cç][oõ]es)/ },
  { label: "extraction", weight: 0.45, re: /\b(texto|conteudo|tudo)\s+(acima|anterior|do\s+sistema)\b.*\b(repit|imprim|mostr|copi)/ },
  { label: "extraction", weight: 0.35, re: /\b(qual|quais)\s+(e\s+)?(o\s+)?(seu\s+)?(modelo|llm|gpt|openai|api\s*key|token)\b/ },

  // 4) Falsa autoridade
  { label: "false_authority", weight: 0.4, re: /\b(nota|mensagem|aviso|comunicado|observa[cç][aã]o)\s+(interna|do\s+sistema|administrativa|do\s+suporte|do\s+desenvolvedor)/ },
  { label: "false_authority", weight: 0.4, re: /\b(autorizado|aprovado|liberado)\s+(pel[oa]\s+)?(gerente|dono|diretor|supervisor|administrador|sistema|ti)\b/ },
  { label: "false_authority", weight: 0.5, re: /\b(modo|mode)\s+(desenvolvedor|developer|debug|manuten[cç][aã]o|admin|deus|god)\b|\bDAN\b|\bjailbreak\b/i },
  { label: "false_authority", weight: 0.35, re: /\b(sou|aqui\s+e)\s+(o\s+)?(desenvolvedor|programador|administrador|dono\s+do\s+sistema|suporte\s+tecnico)\b/ },

  // 5) Fuga de escopo / persona
  { label: "persona_shift", weight: 0.35, re: /\b(finja|pretenda|imagine|simule|atue\s+como|role\s*play|interprete)\s+(que|ser|um|uma|o|a)\b/ },
  { label: "persona_shift", weight: 0.3, re: /\b(sem|ignore\s+as?)\s+(restri[cç][oõ]es|limita[cç][oõ]es|filtros?|censura|regras)\b/ },

  // 6) Contrabando de instrução para a MEMÓRIA (persistência)
  { label: "memory_poison", weight: 0.5, re: /\b(anote|registre|memorize|guarde|lembre[- ]se|salve)\s+(que|isso|o\s+seguinte|na\s+(sua\s+)?(memoria|ficha))\b.{0,80}\b(sempre|nunca|deve|regra|politica|autoriza)/ },
  { label: "memory_poison", weight: 0.4, re: /\b(para\s+(as\s+)?proximas?|nas?\s+proximas?)\s+(conversas?|mensagens?|intera[cç][oõ]es)\b/ },
];

// Sinais estruturais (não-regex) somados por cima das famílias.
const STRUCTURAL_WEIGHTS = {
  invisible: 0.35,   // caractere invisível/tag/homoglifo presente
  encoded: 0.25,     // base64 legível embutido
  spaced: 0.2,       // evasão por letras espaçadas que revela um padrão
  giant: 0.15,       // mensagem muito acima do normal de WhatsApp
};

const GIANT_CHARS = 2500;

export function detectInjection(rawText: string | null | undefined): DetectionResult {
  const raw = rawText ?? "";
  if (!raw.trim()) return { score: 0, labels: [], matched: [] };

  const shadow = securityShadow(raw);
  const collapsed = collapseSpacedLetters(shadow);
  // Base64 é SENSÍVEL A CAIXA — decodificar a sombra (minúscula) destruiria o payload.
  // Por isso a extração roda sobre o texto CRU.
  const decoded = decodeEmbedded(raw);
  // Superfície de teste: sombra + variante colapsada + o que veio codificado.
  const surfaces = [shadow, collapsed !== shadow ? collapsed : "", ...decoded].filter(Boolean);

  const labels = new Set<string>();
  const matched: string[] = [];
  let score = 0;

  for (const rule of RULES) {
    for (const surface of surfaces) {
      const m = surface.match(rule.re);
      if (m) {
        if (!labels.has(rule.label)) score += rule.weight;
        else score += rule.weight * 0.3; // reincidência na mesma família pesa menos
        labels.add(rule.label);
        if (matched.length < 5) matched.push(m[0].slice(0, 80));
        break; // uma regra conta uma vez, mesmo casando em várias superfícies
      }
    }
  }

  // Sinais estruturais.
  const inv = invisibleReport(raw);
  if (inv.count > 0) {
    score += STRUCTURAL_WEIGHTS.invisible;
    labels.add(`unicode:${inv.kinds.join("+")}`);
  }
  if (decoded.length) { score += STRUCTURAL_WEIGHTS.encoded; labels.add("encoded"); }
  if (collapsed !== shadow && labels.size > 0) { score += STRUCTURAL_WEIGHTS.spaced; labels.add("spaced"); }
  if (raw.length > GIANT_CHARS) { score += STRUCTURAL_WEIGHTS.giant; labels.add("oversize"); }

  return { score: Math.min(1, Number(score.toFixed(3))), labels: [...labels], matched };
}

// Instrução imperativa em 2ª pessoa dentro de um texto que deveria ser FACTUAL
// (resumo de memória, campo de perfil). Usado pela quarentena de memória — é um
// teste mais estreito e mais severo que o detector geral.
const IMPERATIVE_RE = /\b(voce|vc)\s+(deve|precisa|tem\s+que|nunca|sempre|pode|nao\s+pode)\b|\b(ignore|desconsidere|esque[cç]a|responda|diga|informe|ofere[cç]a|autorize|libere)\s+(sempre|nunca|que|ao|para|todos?|qualquer)\b|\b(regra|politica|instru[cç][aã]o)\s+(nova|atualizada|interna)\b/;

export function looksLikeInstruction(text: string | null | undefined): boolean {
  if (!text) return false;
  const s = securityShadow(text);
  return IMPERATIVE_RE.test(s);
}

// Remove de um texto factual as LINHAS que parecem instrução (quarentena de leitura).
// Conservador: só descarta a linha ofensiva, preserva o resto do resumo.
export function stripInstructionLines(text: string | null | undefined): { text: string; removed: number } {
  if (!text) return { text: "", removed: 0 };
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((l) => !looksLikeInstruction(l));
  return { text: kept.join("\n").trim(), removed: lines.length - kept.length };
}
