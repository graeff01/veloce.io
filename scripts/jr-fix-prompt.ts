// Correção do apply anterior: as regras #2/#5 tinham ido pro campo `rules`, que é
// IGNORADO quando `customPrompt` está setado (orchestrator.ts:108). A JR usa customPrompt.
// Este script:
//   1) REVERTE o bloco anexado em `rules` (se presente);
//   2) ANEXA as regras #2 (medida aproximada) e #5 (conjunto/pia + desconto montagem)
//      ao `customPrompt`, com carve-out explícito p/ a pia (que o customPrompt hoje manda escalar).
// IDEMPOTENTE. DRY-RUN por padrão; use --apply.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

// Bloco que foi (erroneamente) anexado em `rules` — para reverter.
const RULES_MARKER = "MEDIDAS (quando o lead perguntar por tamanho)";

// Marcador e conteúdo do bloco correto, agora no customPrompt.
const CP_MARKER = "CONJUNTOS, COMPLEMENTOS E MEDIDAS (regras de orçamento)";
const CP_ADDITION =
  "\n\n" +
  CP_MARKER + ":\n" +
  "- MEDIDA APROXIMADA: se o cliente perguntar por um tamanho específico (ex.: \"tem uma de 74cm?\"), sempre indique proativamente a medida DISPONÍVEL mais próxima, com o valor aproximado (ex.: \"a mais próxima é a Prime 9, com 74 cm de largura\"). Nunca responda só \"não temos\" — ofereça a opção mais próxima.\n" +
  "- VÁRIOS ITENS NO MESMO ORÇAMENTO: você PODE e DEVE incluir vários itens-base no MESMO orçamento (ex.: churrasqueira + fogão + pia). NUNCA diga que \"o sistema só aceita um item por orçamento\" — isso é FALSO.\n" +
  "- PIA, BANCADA, BALCÃO e demais COMPLEMENTOS que EXISTEM no catálogo (pia_gourmet, pia_inox, bancada_gourmet, balcao_1m...) NÃO são \"custom\": são itens-base. Se o cliente quer a churrasqueira/conjunto COM a pia, INCLUA a pia no orçamento — NÃO escale por causa disso (a regra de escalar item custom vale só p/ o que NÃO existe no catálogo).\n" +
  "- SEM COMBO EXATO / CONJUNTO COM EXTRA: se não há um combo exato pro que o cliente quer, ou ele quer um conjunto MAIS um complemento (pia etc.), monte o orçamento ITEMIZANDO cada peça física como item-base (ex.: prime_16 + fogao_campeiro_4 + pia_gourmet). NÃO misture uma chave de combo (conj_*) com itens extras — itemize tudo em peças individuais (o preço do produto é o mesmo, e o desconto de montagem sai correto).\n" +
  "- DESCONTO DE MONTAGEM (automático por quantidade de PEÇAS físicas): 2 peças = 10%; 3 peças ou mais = 13%. O catálogo traz combinações prontas só como sugestão — você pode montar qualquer combinação.";

async function main() {
  const jr = await prisma.client.findFirst({ where: { name: { contains: "JR", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!jr) throw new Error("JR não encontrada");
  console.log(`Cliente: ${jr.name} (${jr.id})`);
  console.log(APPLY ? "\n*** APPLY ***\n" : "\n--- DRY-RUN (use --apply) ---\n");

  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: jr.id }, select: { rules: true, customPrompt: true } });
  let rules = cfg?.rules ?? "";
  let cp = cfg?.customPrompt ?? "";

  // 1) Reverter o bloco anexado em `rules`.
  const idx = rules.indexOf(RULES_MARKER);
  if (idx >= 0) {
    // corta a partir do início do parágrafo do marcador (remove o "\n\n" que o precede também).
    const cut = rules.lastIndexOf("\n\n", idx);
    const newRules = (cut >= 0 ? rules.slice(0, cut) : rules.slice(0, idx)).trimEnd();
    console.log(`[rules] revertendo bloco anexado (de ${rules.length} → ${newRules.length} chars)`);
    if (APPLY) await prisma.aiAgentConfig.update({ where: { clientId: jr.id }, data: { rules: newRules } });
    rules = newRules;
  } else {
    console.log("[rules] nada a reverter (marcador ausente)");
  }

  // 2) Anexar o bloco correto ao customPrompt.
  if (!cp.trim()) {
    console.log("[customPrompt] VAZIO — abortando (não deveria; JR usa customPrompt).");
    return;
  }
  if (cp.includes(CP_MARKER)) {
    console.log("[customPrompt] já contém o bloco (marcador presente) — nada a fazer.");
  } else {
    const newCp = cp.trimEnd() + CP_ADDITION;
    console.log(`[customPrompt] anexando bloco #2+#5 (de ${cp.length} → ${newCp.length} chars)`);
    if (APPLY) await prisma.aiAgentConfig.update({ where: { clientId: jr.id }, data: { customPrompt: newCp } });
  }

  console.log("\nPronto.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
