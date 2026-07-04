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
const SANGRIA_SPEND_7D = 100;  // gasto em 7d sem lead real → sangria (R$)
const MIN_AGE_DAYS = 3;        // anúncio mais novo ainda aprende → não alerta sangria
const isWhatsappDest = (d: string | null) => !d || d.includes("WHATSAPP");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface AdsAlert { dedupeKey: string; title: string; pushBody: string; tg: string }

export async function runAdsHealth(): Promise<{ sent: number; alerts: number }> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0, alerts: 0 };

  const day = nowParts(TZ).ymd;
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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

    // 1b) Diagnóstico por anúncio ATIVO (últimos 7d): destino fora do WhatsApp,
    // sangria (gasto sem lead real) e relevância abaixo da média. 1 alerta/anúncio
    // por dia, na prioridade destino > sangria > relevância.
    const activeAds = await prisma.metaAd.findMany({
      where: { connectionId: c.id, status: "ACTIVE" },
      select: { adId: true, name: true, adsetId: true, startedAt: true, qualityRanking: true, conversionRanking: true },
    });
    if (activeAds.length > 0) {
      const adIds = activeAds.map((a) => a.adId);
      const wa = await prisma.waConnection.findUnique({ where: { clientId: c.clientId }, select: { id: true } });
      const [destSets, spendRows, leadRows] = await Promise.all([
        prisma.metaAdSet.findMany({ where: { connectionId: c.id, adsetId: { in: [...new Set(activeAds.map((a) => a.adsetId))] } }, select: { adsetId: true, destinationType: true } }),
        prisma.metaAdInsight.groupBy({ by: ["adId"], where: { connectionId: c.id, adId: { in: adIds }, date: { gte: sevenDaysAgo } }, _sum: { spend: true } }),
        wa ? prisma.waLead.groupBy({ by: ["adId"], where: { connectionId: wa.id, adId: { in: adIds }, enteredAt: { gte: sevenDaysAgo } }, _count: { _all: true } })
           : Promise.resolve([] as { adId: string | null; _count: { _all: number } }[]),
      ]);
      const destByAdset = new Map(destSets.map((s) => [s.adsetId, s.destinationType]));
      const spend7 = new Map<string, number>(); for (const r of spendRows) spend7.set(r.adId, r._sum.spend ?? 0);
      const leads7 = new Map<string, number>(); for (const r of leadRows) if (r.adId) leads7.set(r.adId, r._count._all);

      for (const ad of activeAds) {
        const spend = spend7.get(ad.adId) ?? 0;
        if (spend <= 0) continue; // só anúncios entregando
        const leads = leads7.get(ad.adId) ?? 0;
        const dest = destByAdset.get(ad.adsetId) ?? null;
        const ageDays = ad.startedAt ? Math.floor((Date.now() - ad.startedAt.getTime()) / 86_400_000) : null;

        if (dest && !isWhatsappDest(dest)) {
          alerts.push({
            dedupeKey: `ads-dest:${day}:${c.id}:${ad.adId}`,
            title: `📵 Anúncio fora do WhatsApp — ${clientName}`,
            pushBody: `"${ad.name}" direciona para outro destino (${dest}). Os leads não chegam ao WhatsApp.`,
            tg: `📵 <b>Destino fora do WhatsApp</b> — ${esc(clientName)}\n${esc(ad.name)}\nO clique vai para ${esc(dest)}, não para o WhatsApp conectado — os leads não chegam aqui.\n\n${adsLink}`,
          });
        } else if (leads === 0 && spend >= SANGRIA_SPEND_7D && (ageDays == null || ageDays > MIN_AGE_DAYS)) {
          alerts.push({
            dedupeKey: `ads-sangria:${day}:${c.id}:${ad.adId}`,
            title: `🔴 Anúncio gastando sem lead — ${clientName}`,
            pushBody: `"${ad.name}" gastou ${brl(spend)} em 7 dias sem nenhum lead real no WhatsApp.`,
            tg: `🔴 <b>Gastando sem lead real</b> — ${esc(clientName)}\n${esc(ad.name)}\n${brl(spend)} nos últimos 7 dias e 0 lead real no WhatsApp. Reveja criativo/segmentação ou pause.\n\n${adsLink}`,
          });
        } else if (ad.conversionRanking?.startsWith("BELOW_AVERAGE") || ad.qualityRanking?.startsWith("BELOW_AVERAGE")) {
          const dim = ad.conversionRanking?.startsWith("BELOW_AVERAGE") ? "taxa de conversão" : "qualidade do criativo";
          alerts.push({
            dedupeKey: `ads-rel:${day}:${c.id}:${ad.adId}`,
            title: `🟠 Relevância baixa — ${clientName}`,
            pushBody: `"${ad.name}" está com ${dim} abaixo da média na Meta.`,
            tg: `🟠 <b>Relevância abaixo da média</b> — ${esc(clientName)}\n${esc(ad.name)}\nA Meta classifica a ${dim} abaixo dos concorrentes. Vale renovar criativo/oferta.\n\n${adsLink}`,
          });
        }
      }
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
        { pushEnabled: r.pushEnabled })) sent++;
    }
  }
  return { sent, alerts: alerts.length };
}
