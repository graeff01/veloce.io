import { prisma } from "@/lib/prisma";
import { recipientsFor, claimDispatch } from "@/lib/notifications/dispatch";
import { esc, APP_URL } from "@/lib/notifications/digest";
import { nowParts } from "@/lib/tz";

// Saúde de anúncios intraday — proteção de verba no MESMO dia (não no fim do mês):
//   • anúncio reprovado / com pendência pela Meta (effective_status)
//   • campanha ativa que parou de entregar (R$0 nas últimas 48h)
// Reusa a preferência de alertas críticos. Dedupe por dia+problema (1 aviso/dia).

const TZ = "America/Sao_Paulo";
const BAD_AD_STATUS = ["DISAPPROVED", "WITH_ISSUES"]; // effective_status problemáticos

interface AdsAlert { dedupeKey: string; title: string; pushBody: string; tg: string }

export async function runAdsHealth(): Promise<{ sent: number; alerts: number }> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0, alerts: 0 };

  const day = nowParts(TZ).ymd;
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const conns = await prisma.metaConnection.findMany({
    select: { id: true, clientId: true, client: { select: { name: true } } },
  });

  const alerts: AdsAlert[] = [];

  for (const c of conns) {
    const clientName = c.client.name;
    const adsLink = `<a href="${APP_URL}/clients/${c.clientId}?tab=anuncios">Abrir anúncios →</a>`;

    const activeCampaigns = await prisma.metaCampaign.findMany({
      where: { connectionId: c.id, status: "ACTIVE" },
      select: { campaignId: true, name: true, createdAt: true },
    });
    if (activeCampaigns.length === 0) continue;
    const activeIds = activeCampaigns.map((x) => x.campaignId);

    // 1) Anúncios reprovados/com pendência em campanha ativa.
    const badAds = await prisma.metaAd.findMany({
      where: { connectionId: c.id, status: { in: BAD_AD_STATUS }, campaignId: { in: activeIds } },
      select: { adId: true, name: true, status: true },
    });
    for (const ad of badAds) {
      const motivo = ad.status === "DISAPPROVED" ? "reprovado" : "com pendência";
      alerts.push({
        dedupeKey: `ads-bad:${day}:${c.id}:${ad.adId}`,
        title: `🚫 Anúncio ${motivo} — ${clientName}`,
        pushBody: `O anúncio "${ad.name}" está ${motivo} na Meta.`,
        tg: `🚫 <b>Anúncio ${motivo}</b> — ${esc(clientName)}\n${esc(ad.name)}\n\n${adsLink}`,
      });
    }

    // 2) Campanha ativa (conhecida há +2 dias) sem gasto nas últimas 48h.
    // Exige createdAt antigo p/ não alertar campanha recém-criada (sem insights ainda).
    const established = activeCampaigns.filter((x) => x.createdAt < twoDaysAgo);
    if (established.length === 0) continue;

    const ads = await prisma.metaAd.findMany({
      where: { connectionId: c.id, campaignId: { in: established.map((x) => x.campaignId) } },
      select: { adId: true, campaignId: true },
    });
    if (ads.length === 0) continue;
    const adToCampaign = new Map(ads.map((a) => [a.adId, a.campaignId]));
    const insights = await prisma.metaAdInsight.findMany({
      where: { connectionId: c.id, date: { gte: twoDaysAgo }, adId: { in: ads.map((a) => a.adId) } },
      select: { adId: true, spend: true },
    });
    const spendByCampaign = new Map<string, number>();
    for (const ins of insights) {
      const camp = adToCampaign.get(ins.adId);
      if (camp) spendByCampaign.set(camp, (spendByCampaign.get(camp) ?? 0) + ins.spend);
    }
    for (const camp of established) {
      if ((spendByCampaign.get(camp.campaignId) ?? 0) > 0) continue;
      alerts.push({
        dedupeKey: `ads-nodelivery:${day}:${c.id}:${camp.campaignId}`,
        title: `🔴 Campanha sem entrega — ${clientName}`,
        pushBody: `A campanha "${camp.name}" está ativa mas não gastou nada nas últimas 48h.`,
        tg: `🔴 <b>Campanha sem entrega</b> — ${esc(clientName)}\n${esc(camp.name)}\nAtiva, mas R$0 nas últimas 48h. Verifique orçamento/segmentação.\n\n${adsLink}`,
      });
    }
  }

  if (alerts.length === 0) return { sent: 0, alerts: 0 };

  let sent = 0;
  for (const r of recipients) {
    for (const a of alerts) {
      if (await claimDispatch(`${a.dedupeKey}:${r.userId}`, r.userId, "ads_health",
        { title: a.title, body: a.pushBody, url: `/clients` }, a.tg,
        { pushEnabled: r.pushEnabled, telegramEnabled: r.telegramEnabled })) sent++;
    }
  }
  return { sent, alerts: alerts.length };
}
