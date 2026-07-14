// Orientação de ficha + orçamento anexada ao prompt quando quotesEnabled. Informa
// os campos a coletar e o CATÁLOGO de preços (chaves válidas), e crava o fluxo — o
// preço só sai da ferramenta gerar_orcamento. Vazio quando não habilitado.
import { prisma } from "@/lib/prisma";
import { parseSpec } from "./intake";
import { describeRules, type PricingRules } from "./pricing";

export async function buildQuoteGuidance(clientId: string, quotesEnabled: boolean, intakeSpec: unknown): Promise<string> {
  if (!quotesEnabled) return "";
  const parts: string[] = ["── ATENDIMENTO COM ORÇAMENTO ──"];

  const spec = parseSpec(intakeSpec);
  if (spec.length) {
    const campos = spec.map((f) => `- ${f.key}: ${f.label}${f.required ? " (obrigatório)" : ""}${f.options ? ` [opções: ${f.options.join(", ")}]` : ""}`).join("\n");
    parts.push(`FICHA A COLETAR (use atualizar_ficha ao descobrir cada dado):\n${campos}`);
  }

  try {
    const pc = await prisma.pricingConfig.findUnique({ where: { clientId } });
    if (pc) {
      const cat = describeRules(pc.rules as unknown as PricingRules);
      if (cat) parts.push(`CATÁLOGO DE PREÇOS (use SOMENTE estas chaves em gerar_orcamento):\n${cat}`);
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
