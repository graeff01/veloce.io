/**
 * Prompt Compiler — DEMO end-to-end (offline, sem banco).
 * Compila um conjunto-mini representativo de módulos (estilo JR) a partir de fontes
 * estruturadas + parâmetros reais → mostra o prompt montado e o relatório (tokens por
 * módulo + lint). Prova a arquitetura do RFC §4 sem tocar em produção. Adotar o compilador
 * no runtime é a etapa seguinte, gateada pela simulação (docs/rfc-prompt-compiler.md §4.4).
 *
 * Uso: npx tsx scripts/prompt-compile.ts
 */
import { compilePrompt, type CompileInput, type PolicyModule } from "@/lib/ai-agent/prompt-compiler";

// PARÂMETROS de negócio (fonte única — na adoção viriam de pricingConfig.policies).
const params = {
  freight_assembly_threshold: 250, // pol.freightAssemblyThreshold
  cash_discount_pct: 8,            // pol.cashDiscountPct
};

// POLICY MODULES — cada regra UMA vez, número por {{placeholder}}, exemplo em examples[].
const modules: PolicyModule[] = [
  { id: "identidade", topic: "identidade", priority: 1,
    text: "Você é o Juninho, assistente virtual da JR Churrasqueiras. Tom cordial, direto, gaúcho e humano." },
  { id: "abertura-nome", topic: "abertura", priority: 1,
    text: "No 1º contato, cumprimente e pergunte o nome do lead antes de conduzir a venda.",
    examples: ["Olá! Sou o Juninho 🤖 da JR Churrasqueiras. Qual seu nome?"] },
  { id: "uma-pergunta", topic: "conducao", priority: 1, intent: "uma-pergunta",
    text: "Faça UMA pergunta por mensagem. Não empilhe perguntas." },
  { id: "gatear-modelo", topic: "conducao", priority: 2,
    text: "Se o lead citar um modelo específico, fale só dele; se for genérico, apresente o catálogo." },
  { id: "frete-montagem", topic: "orcamento", priority: 1,
    text: "Frete acima de R${{freight_assembly_threshold}} exige montagem." },
  { id: "desconto-vista", topic: "orcamento", priority: 2,
    text: "Pagamento à vista tem {{cash_discount_pct}}% de desconto sobre os produtos." },
  { id: "foto-modelo", topic: "midia", priority: 1, intent: "foto",
    text: "Mande a foto do modelo citado quando fizer sentido; não reenvie a mesma foto nem faça spam." },
  { id: "nao-invente", topic: "blindagem", priority: 1, intent: "nao-invente",
    text: "Nunca invente specs, medidas, valores ou benefícios. Tudo vem do motor/Conhecimento." },
  { id: "nao-invente-reforco", topic: "blindagem", priority: 9, intent: "nao-invente", reforco: true,
    text: "Reforço crítico: na dúvida sobre qualquer número ou spec, NÃO afirme — consulte o Conhecimento." },
];

const knowledge = [
  "o lead pedir medidas/specs de um modelo (estão no Conhecimento)",
  "o lead perguntar garantia, chaminé ou detalhe técnico",
];

const input: CompileInput = { modules, params, knowledge };
const { prompt, report } = compilePrompt(input);

console.log("\n══ PROMPT COMPILADO ══\n");
console.log(prompt);

console.log("\n══ RELATÓRIO ══");
console.log(`Total: ${report.chars} chars ≈ ${report.approxTokens} tokens · ${report.perModule.length} módulos`);
console.log(`Lint: ${report.ok ? "✓ build verde (0 erros)" : "✗ build BLOQUEADO"}`);
for (const s of report.perModule) {
  console.log(`  ${String(s.approxTokens).padStart(4)} tok  [${s.topic}] ${s.id}`);
}
if (report.issues.length) {
  console.log("\n── issues ──");
  for (const i of report.issues) console.log(`  ${i.severity === "error" ? "✗" : "•"} [${i.kind}]${i.moduleId ? ` (${i.moduleId})` : ""} ${i.message}`);
} else {
  console.log("\nSem issues: cada conceito num lar canônico, números por placeholder (zero drift), reforço deliberado preservado.");
}
process.exit(report.ok ? 0 : 1);
