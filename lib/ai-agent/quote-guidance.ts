// Orientação de ficha + orçamento anexada ao prompt quando quotesEnabled. Informa
// os campos a coletar e o CATÁLOGO de preços (chaves válidas), e crava o fluxo — o
// preço só sai da ferramenta gerar_orcamento. Vazio quando não habilitado.
//
// Fase 2 do Runtime (lazy catalog): o CATÁLOGO de preços (~1.600 tokens na JR) só é de
// fato necessário quando o modelo chama gerar_orcamento, mas hoje é injetado em TODO
// turno. Com AI_LAZY_CATALOG=on, o catálogo sai do prompt — a NOTA DE FRETE (comportamental)
// e o FLUXO ficam. Isso é seguro porque gerar_orcamento JÁ é auto-suficiente: se o modelo
// usar uma chave inválida, a própria ferramenta devolve a lista completa de códigos (tools.ts
// linha ~640) e o modelo corrige. Ou seja, o catálogo se entrega SOB DEMANDA, na hora exata.
// off (padrão) = comportamento atual byte-a-byte. Vira parte do Vertical Pack depois.
import { prisma } from "@/lib/prisma";
import { parseSpec } from "./intake";
import { describeRules, describeFreightNote, type PricingRules } from "./pricing";

// off = catálogo sempre (comportamento original).
// on  = catálogo NUNCA no prompt (self-heal do gerar_orcamento devolve na hora). Validado.
// smart = catálogo fora do prompt na COLETA, mas INJETADO quando o orçamento está iminente
//         (ficha completa / estado orçamento) — evita o round-trip do self-heal no turno do
//         orçamento E mantém a economia na coleta. Monotonicamente ≥ "on" (pior caso = self-heal).
export type LazyCatalogMode = "off" | "on" | "smart";
export function lazyCatalogMode(): LazyCatalogMode {
  const m = (process.env.AI_LAZY_CATALOG || "off").toLowerCase();
  return m === "on" || m === "smart" ? m : "off";
}

export async function buildQuoteGuidance(clientId: string, quotesEnabled: boolean, intakeSpec: unknown, quoteImminent = false): Promise<string> {
  if (!quotesEnabled) return "";
  const mode = lazyCatalogMode();
  // "smart": só esconde o catálogo enquanto o orçamento NÃO está iminente.
  const lazy = mode === "on" || (mode === "smart" && !quoteImminent);
  const parts: string[] = ["── ATENDIMENTO COM ORÇAMENTO ──"];

  const spec = parseSpec(intakeSpec);
  if (spec.length) {
    const campos = spec.map((f) => `- ${f.key}: ${f.label}${f.required ? " (obrigatório)" : ""}${f.options ? ` [opções: ${f.options.join(", ")}]` : ""}`).join("\n");
    parts.push(`FICHA A COLETAR (use atualizar_ficha ao descobrir cada dado):\n${campos}`);
  }

  try {
    const pc = await prisma.pricingConfig.findUnique({ where: { clientId } });
    if (pc) {
      const rules = pc.rules as unknown as PricingRules;
      if (lazy) {
        // Catálogo FORA do prompt (economia). Mantém a nota de FRETE (comportamental:
        // multi-zona → pedir_localizacao) e explica como o modelo obtém os códigos.
        const freightNote = rules.freight?.length ? describeFreightNote(rules.freight) : "";
        if (freightNote) parts.push(freightNote);
        parts.push(
          "CÓDIGOS DO CATÁLOGO: você NÃO precisa decorá-los. Continue conversando sobre os produtos pelo NOME normalmente. " +
          "Na hora de orçar, chame gerar_orcamento — se algum código não existir, a própria ferramenta te devolve a LISTA COMPLETA de códigos válidos; use-a e chame de novo. NUNCA invente preço.",
        );
      } else {
        const cat = describeRules(rules);
        if (cat) parts.push(`CATÁLOGO DE PREÇOS (use SOMENTE estas chaves em gerar_orcamento):\n${cat}`);
      }
    }
  } catch { /* catálogo é opcional */ }

  parts.push(
    "FLUXO: 1) colete a ficha — SEMPRE o MODELO e o ENDEREÇO/CIDADE antes de orçar " +
    "(sem eles gerar_orcamento é bloqueado; o endereço define o FRETE); " +
    "2) com os dados, chame gerar_orcamento com as chaves EXATAS do catálogo — NÃO inclua frete, " +
    "ele é calculado automaticamente pela região; " +
    "3) chame gerar_orcamento e, LOGO EM SEGUIDA, enviar_orcamento — o PDF vai DIRETO junto do total, " +
    "sem perguntar se o lead quer receber; o orçamento em PDF É a apresentação; " +
    "4) SÓ quando o lead aprovar/quiser comprar, use aprovar_orcamento (aciona o vendedor). " +
    "NUNCA diga preço, total, frete ou desconto fora do resultado de gerar_orcamento.",
  );
  return parts.join("\n\n");
}
