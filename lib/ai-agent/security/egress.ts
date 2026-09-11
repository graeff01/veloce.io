// ── Camada de segurança · Anel 4: DLP de saída ────────────────────────────────
// Última barreira antes do texto chegar ao lead. Complementa o stripToolCallLeak
// (que já existe) cobrindo o que NUNCA pode vazar numa resposta de atendimento:
// segredo, identificador interno, estrutura do prompt e diagnóstico de sistema.
//
// Classe B: em tráfego legítimo não casa nada (as classes abaixo não aparecem em
// prosa de vendas). Quando casa, a ação é a MESMA que o guardrail já usa hoje —
// trocar pela mensagem de fallback do cliente, caminho testado em produção.
//
// Módulo PURO — testável em tests/security-egress.test.ts.

export type EgressSeverity = "critical" | "high" | "medium";

export interface EgressFinding {
  kind: string;
  severity: EgressSeverity;
  sample: string;
}

export interface EgressResult {
  clean: boolean;
  findings: EgressFinding[];
  /** Texto com os achados de severidade média removidos (sanitização silenciosa). */
  redacted: string;
  /** true quando há achado que exige trocar a resposta inteira pelo fallback. */
  mustBlock: boolean;
}

interface EgressRule {
  kind: string;
  severity: EgressSeverity;
  re: RegExp;
  /** medium = remove o trecho; high/critical = bloqueia a resposta toda. */
}

const RULES: EgressRule[] = [
  // Segredos — bloqueio imediato.
  { kind: "secret:openai", severity: "critical", re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { kind: "secret:meta", severity: "critical", re: /\bEAA[A-Za-z0-9]{20,}/g },
  { kind: "secret:bearer", severity: "critical", re: /\bBearer\s+[A-Za-z0-9._-]{20,}/gi },
  { kind: "secret:ciphertext", severity: "critical", re: /\benc:v1:[A-Za-z0-9+/=]{10,}/g },
  { kind: "secret:env", severity: "critical", re: /\b(OPENAI_API_KEY|NEXTAUTH_SECRET|ENCRYPTION_KEY|CRON_SECRET|DATABASE_URL|WHATSAPP_APP_SECRET)\b/g },

  // Diagnóstico / internals — bloqueio.
  { kind: "diagnostic:stack", severity: "high", re: /\bat\s+\w+\s+\(?\/?(?:home|app|lib|var)\/[^\s)]+:\d+:\d+/g },
  { kind: "diagnostic:orm", severity: "high", re: /\bprisma\.\w+\.(findMany|findUnique|findFirst|create|update|upsert|delete)\b/g },
  { kind: "diagnostic:sql", severity: "high", re: /\bSELECT\s+[\w",*\s]+\s+FROM\s+"?\w+"?/gi },
  { kind: "diagnostic:path", severity: "high", re: /\b(?:lib|app|node_modules)\/[\w./-]+\.(?:ts|tsx|js)\b/g },

  // Estrutura do prompt — bloqueio (complementa a regra UNIVERSAL do guardrail,
  // que hoje pega a INTENÇÃO declarada, não o vazamento literal do cabeçalho).
  { kind: "prompt:header", severity: "high", re: /^\s*(LIMITES|SEGURANÇA|OBJETIVO|VOZ|QUALIFICAÇÃO|CONHECIMENTO|PERFIL DO LEAD|MEMÓRIA DESTE LEAD|COMO CONDUZIR A CONVERSA|STATUS DA LOJA AGORA)\s*[—:(]/gmi },
  { kind: "prompt:meta", severity: "high", re: /\b(bloco est[áa]vel|prompt do sistema|system prompt|minhas instru[cç][oõ]es internas)\b/gi },

  // Identificadores internos — remoção silenciosa (não justificam trocar a resposta).
  { kind: "internal:cuid", severity: "medium", re: /\bc[a-z0-9]{24}\b/g },
  { kind: "internal:phoneNumberId", severity: "medium", re: /\bphone_?number_?id\b\s*[:=]?\s*\d{10,}/gi },
  { kind: "internal:wamid", severity: "medium", re: /\bwamid\.[A-Za-z0-9=_-]{10,}/g },
];

export function scanEgress(text: string | null | undefined): EgressResult {
  const t = text ?? "";
  if (!t.trim()) return { clean: true, findings: [], redacted: t, mustBlock: false };

  const findings: EgressFinding[] = [];
  let redacted = t;
  let mustBlock = false;

  for (const rule of RULES) {
    // Regex com /g é stateful entre chamadas de .test(); usamos match() (que reseta).
    const hits = t.match(rule.re);
    if (!hits?.length) continue;
    findings.push({ kind: rule.kind, severity: rule.severity, sample: hits[0].slice(0, 60) });
    if (rule.severity === "medium") {
      redacted = redacted.replace(rule.re, "");
    } else {
      mustBlock = true;
    }
  }

  if (findings.length && !mustBlock) {
    redacted = redacted.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  return { clean: findings.length === 0, findings, redacted, mustBlock };
}

// Vazamento de PII de TERCEIRO: telefone/e-mail na resposta que não pertence a este
// contato nem aparece nas fontes legítimas do turno. É o cenário mais grave de uma
// injeção bem-sucedida (a IA repetir dado de outro lead) e nenhuma camada atual pega.
export function scanThirdPartyPii(
  reply: string | null | undefined,
  allowed: { contactWaId?: string | null; sources?: string | null },
): EgressFinding[] {
  const t = reply ?? "";
  if (!t.trim()) return [];
  const digitsOf = (s: string) => s.replace(/\D/g, "");
  const src = allowed.sources ?? "";
  const srcDigits = digitsOf(src);
  const ownDigits = digitsOf(allowed.contactWaId ?? "");

  const out: EgressFinding[] = [];

  // Telefones brasileiros plausíveis (10-13 dígitos com separadores comuns).
  for (const m of t.match(/(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g) ?? []) {
    const d = digitsOf(m);
    if (d.length < 10) continue;
    const tail = d.slice(-8); // compara pelo miolo (tolera 9º dígito e DDI)
    if (ownDigits.includes(tail)) continue;   // é o próprio lead
    if (srcDigits.includes(tail)) continue;   // veio de fonte legítima (loja, conhecimento)
    out.push({ kind: "pii:phone_third_party", severity: "high", sample: m.slice(0, 32) });
  }

  // E-mails que não aparecem nas fontes.
  for (const m of t.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) ?? []) {
    if (src.toLowerCase().includes(m.toLowerCase())) continue;
    out.push({ kind: "pii:email_third_party", severity: "high", sample: m.slice(0, 40) });
  }

  return out;
}
