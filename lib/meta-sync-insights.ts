import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export class MetaTokenError extends Error {}
export class MetaRateLimitError extends Error {}

export async function syncMetaInsights(
  connectionId: string,
  since: string,
  until: string
): Promise<{ synced: number; period: { since: string; until: string } }> {
  const conn = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("Conexão não encontrada");

  const accessToken = decryptSecret(conn.accessToken);

  const fields = "campaign_id,campaign_name,adset_id,adset_name,objective,status,spend,impressions,reach,clicks,ctr,cpm,cpc,actions,action_values,cost_per_action_type";
  const url = new URL(`https://graph.facebook.com/v21.0/${conn.adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("level", "adset");
  url.searchParams.set("time_increment", "all_days");
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  const metaRes = await fetch(url.toString());
  const metaData = await metaRes.json();

  if (!metaRes.ok || metaData.error) {
    const err = metaData.error;
    if (err?.code === 190 || err?.type === "OAuthException") {
      throw new MetaTokenError(err?.message ?? "Token expirado/revogado");
    }
    if (err?.code === 17 || err?.code === 80004 || err?.code === 4) {
      throw new MetaRateLimitError(err?.message ?? "Rate limit atingido");
    }
    throw new Error(err?.message ?? "Erro ao buscar dados do Meta");
  }

  const rows: typeof metaData.data = metaData.data ?? [];

  function getAction(actions: { action_type: string; value: string }[] | undefined, type: string): number {
    if (!actions) return 0;
    return parseFloat(actions.find(a => a.action_type === type)?.value ?? "0");
  }

  function getCost(costPerAction: { action_type: string; value: string }[] | undefined, type: string): number {
    if (!costPerAction) return 0;
    return parseFloat(costPerAction.find(a => a.action_type === type)?.value ?? "0");
  }

  function getActionValue(actionValues: { action_type: string; value: string }[] | undefined, type: string): number {
    if (!actionValues) return 0;
    return parseFloat(actionValues.find(a => a.action_type === type)?.value ?? "0");
  }

  await prisma.metaInsight.deleteMany({
    where: { connectionId: connectionId, dateStart: new Date(since) },
  });

  let synced = 0;
  for (const row of rows) {
    const spend = parseFloat(row.spend ?? "0");
    const leads = getAction(row.actions, "lead") || getAction(row.actions, "onsite_conversion.lead_grouped");
    const purchases = getAction(row.actions, "purchase");
    const cpl = getCost(row.cost_per_action_type, "lead") || (leads > 0 ? spend / leads : 0);
    const purchaseValue = getActionValue(row.action_values, "purchase");
    const roas = spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0;

    await prisma.metaInsight.upsert({
      where: {
        connectionId_campaignId_adsetId_dateStart_dateStop: {
          connectionId: connectionId,
          campaignId: row.campaign_id,
          adsetId: row.adset_id ?? null,
          dateStart: new Date(since),
          dateStop: new Date(until),
        },
      },
      create: {
        connectionId: connectionId,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        adsetId: row.adset_id ?? null,
        adsetName: row.adset_name ?? null,
        status: row.status ?? "UNKNOWN",
        dateStart: new Date(since),
        dateStop: new Date(until),
        spend,
        impressions: parseInt(row.impressions ?? "0"),
        reach: parseInt(row.reach ?? "0"),
        clicks: parseInt(row.clicks ?? "0"),
        ctr: parseFloat(row.ctr ?? "0"),
        cpm: parseFloat(row.cpm ?? "0"),
        cpc: parseFloat(row.cpc ?? "0"),
        leads: Math.round(leads),
        cpl,
        purchases: Math.round(purchases),
        roas,
      },
      update: {
        campaignName: row.campaign_name,
        adsetName: row.adset_name ?? null,
        status: row.status ?? "UNKNOWN",
        spend,
        impressions: parseInt(row.impressions ?? "0"),
        reach: parseInt(row.reach ?? "0"),
        clicks: parseInt(row.clicks ?? "0"),
        ctr: parseFloat(row.ctr ?? "0"),
        cpm: parseFloat(row.cpm ?? "0"),
        cpc: parseFloat(row.cpc ?? "0"),
        leads: Math.round(leads),
        cpl,
        purchases: Math.round(purchases),
        roas,
      },
    });
    synced++;
  }

  await prisma.metaConnection.update({
    where: { id: connectionId },
    data: { lastSyncAt: new Date() },
  });

  return { synced, period: { since, until } };
}
