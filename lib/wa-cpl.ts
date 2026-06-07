import { prisma } from "@/lib/prisma";

// ── CPL real: cruza o gasto do Meta Ads com os leads reais por modelo ────────
// Match por NOME: a campanha/adset do Meta cujo nome contém o modelo detectado
// ("Taos Highline"). Mostra o custo por lead real vs. o que o Meta reporta.

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface CplRow {
  model: string;
  realLeads: number;   // leads que de fato chegaram no WhatsApp
  spend: number;       // gasto do Meta no(s) anúncio(s) do modelo
  cplReal: number | null;
  metaLeads: number;   // leads que o Meta reporta
  cplMeta: number | null;
}

export async function computeCplByModel(
  clientId: string,
  models: { adTitle: string; total: number }[],
): Promise<CplRow[]> {
  if (models.length === 0) return [];

  const meta = await prisma.metaConnection.findUnique({
    where: { clientId },
    include: { insights: { select: { campaignName: true, adsetName: true, spend: true, leads: true } } },
  });
  if (!meta || meta.insights.length === 0) return [];

  return models
    .map((m) => {
      const key = norm(m.adTitle);
      let spend = 0;
      let metaLeads = 0;
      for (const ins of meta.insights) {
        const name = `${norm(ins.campaignName ?? "")} ${norm(ins.adsetName ?? "")}`;
        if (key && name.includes(key)) {
          spend += ins.spend;
          metaLeads += ins.leads;
        }
      }
      return {
        model: m.adTitle,
        realLeads: m.total,
        spend,
        cplReal: m.total > 0 && spend > 0 ? spend / m.total : null,
        metaLeads,
        cplMeta: metaLeads > 0 && spend > 0 ? spend / metaLeads : null,
      };
    })
    .filter((r) => r.spend > 0); // só modelos com gasto Meta vinculado
}
