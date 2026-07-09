// Renderização do PDF de orçamento (F2). Usado tanto pela rota de download quanto
// pela ferramenta enviar_orcamento (envia o documento no WhatsApp). Node-only.
import { renderToBuffer } from "@react-pdf/renderer";
import { buildQuoteDoc, type QuoteDocData } from "@/components/ai-agent/quote-document";

export async function renderQuotePdf(data: QuoteDocData): Promise<Buffer> {
  return renderToBuffer(buildQuoteDoc(data));
}

export type { QuoteDocData };
