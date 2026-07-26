/**
 * Prompt Compiler — LINT / auditoria READ-ONLY do customPrompt.
 * Lê o prompt + config de um cliente e aponta drift (número no prompt ≠ config),
 * conceitos duplicados e referências órfãs. NÃO altera nada. Ver docs/rfc-prompt-compiler.md.
 *
 * Uso: DATABASE_URL=... npx tsx scripts/prompt-audit.ts [--client <id>]
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { checkDrift, countConcepts, findOrphanRefs, approxTokens } from "@/lib/ai-agent/eval/prompt-audit";

function arg(name: string): string | undefined { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; }

// Conceitos de regra que costumam ser repetidos (do RFC §2.1) — regex de gatilho por conceito.
const CONCEPTS = [
  { concept: "não invente (specs/valores/benefícios)", re: /n[ãa]o invent|nunca invent/ },
  { concept: "acessórios EXCLUSIVOS da Gourmet", re: /acess[óo]rios?.{0,40}gourmet|gourmet.{0,40}acess[óo]rios?|exclusiv\w*.{0,20}gourmet/ },
  { concept: "uma pergunta/coisa por mensagem", re: /uma (pergunta|coisa) por (mensagem|vez)|uma coisa de cada vez/ },
  { concept: "retirada OU entrega+montagem", re: /retir\w+.{0,30}(entrega|montagem)|entrega (com|e) montagem/ },
  { concept: "não escale por dúvida de preço/modelo/frete", re: /n[ãa]o (mande|escale).{0,40}(vendedor|humano)/ },
  { concept: "foto no modelo citado / não spammar", re: /mand\w* (a )?foto|n[ãa]o.{0,20}repet\w*.{0,10}(foto|imagem)/ },
  { concept: "só o que existe no catálogo/Conhecimento", re: /(s[óo]|apenas).{0,30}(cat[áa]logo|conhecimento)|do (cat[áa]logo|conhecimento)/ },
];

async function main() {
  const clientId = arg("client") ?? "cmrjao9n700dg5vudg1zlymk9"; // JR
  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({ where: { clientId }, select: { customPrompt: true } });
  const prompt = cfg?.customPrompt ?? "";
  if (!prompt) { console.error("Cliente sem customPrompt."); process.exit(1); }
  const pc = await prismaUnscoped.pricingConfig.findUnique({ where: { clientId }, select: { rules: true } });
  const rules = (pc?.rules ?? {}) as Record<string, unknown>;
  const pol = (rules.policies ?? {}) as Record<string, unknown>;
  const asm = Array.isArray(rules.assemblyDiscount) ? rules.assemblyDiscount as { minItems: number; pct: number }[] : [];

  console.log(`\n══ PROMPT AUDIT — cliente ${clientId} ══`);
  console.log(`Tamanho: ${prompt.length} chars ≈ ${approxTokens(prompt)} tokens\n`);

  // DRIFT — números de negócio da config que deveriam bater com o prompt.
  const params = [
    { label: "Limiar frete→montagem (freightAssemblyThreshold)", value: pol.freightAssemblyThreshold as number },
    { label: "Desconto à vista % (cashDiscountPct)", value: pol.cashDiscountPct as number },
    { label: "Parcelas sem juros (installments)", value: pol.installments as number },
    ...asm.map((a) => ({ label: `Desconto montagem ${a.minItems}+ peças (%)`, value: a.pct })),
  ];
  const drift = checkDrift(prompt, params);
  console.log("── DRIFT (número da config presente no prompt?) ──");
  for (const d of drift) console.log(`  ${d.present ? "✓" : "⚠ AUSENTE"}  ${d.label} = ${d.expected}`);
  const missing = drift.filter((d) => !d.present);
  if (missing.length) console.log(`  → ${missing.length} número(s) da config NÃO aparecem no prompt: revisar se há divergência.`);

  // DUPLICAÇÃO
  console.log("\n── CONCEITOS DUPLICADOS (mesma regra repetida) ──");
  const dups = countConcepts(prompt, CONCEPTS);
  if (!dups.length) console.log("  nenhum conceito repetido detectado.");
  for (const d of dups) console.log(`  ${String(d.count).padStart(2)}×  ${d.concept}`);

  // ÓRFÃS
  console.log("\n── REFERÊNCIAS ÓRFÃS (\"ver seção X\" sem a seção) ──");
  const orphans = findOrphanRefs(prompt);
  if (!orphans.length) console.log("  nenhuma.");
  for (const o of orphans) console.log(`  ⚠ "${o}"`);

  console.log("\nNOTA: read-only. Consolidar (mudar o texto) é outra etapa e passa pela simulação.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
