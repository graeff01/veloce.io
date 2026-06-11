import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";

class MetaTokenError extends Error {}
class MetaRateLimitError extends Error {}

// POST — busca insights do Meta e salva no banco
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  try {
    const conn = await prisma.metaConnection.findUnique({ where: { clientId: id } });
    if (!conn) return NextResponse.json({ error: "Conexão Meta não configurada" }, { status: 404 });

    const accessToken = decryptSecret(conn.accessToken);

    // Período: mês atual por padrão, ou override via body
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const since = body.since ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const until = body.until ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const fields = [
      "campaign_id", "campaign_name", "adset_id", "adset_name",
      "objective", "status",
      "spend", "impressions", "reach", "clicks", "ctr", "cpm", "cpc",
      "actions", "action_values", "cost_per_action_type",
    ].join(",");

    const url = new URL(`https://graph.facebook.com/v21.0/${conn.adAccountId}/insights`);
    url.searchParams.append("fields", fields);
    url.searchParams.append("time_range", JSON.stringify({ since, until }));
    url.searchParams.append("level", "adset");
    url.searchParams.append("time_increment", "all_days");
    url.searchParams.append("limit", "200");

    const metaRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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

    // Helpers para extrair actions da resposta do Meta
    function getAction(actions: { action_type: string; value: string }[] | undefined, type: string): number {
      if (!actions) return 0;
      const found = actions.find(a => a.action_type === type);
      return found ? parseFloat(found.value) : 0;
    }

    function getCost(costPerAction: { action_type: string; value: string }[] | undefined, type: string): number {
      if (!costPerAction) return 0;
      const found = costPerAction.find(a => a.action_type === type);
      return found ? parseFloat(found.value) : 0;
    }

    function getActionValue(actionValues: { action_type: string; value: string }[] | undefined, type: string): number {
      if (!actionValues) return 0;
      const found = actionValues.find(a => a.action_type === type);
      return found ? parseFloat(found.value) : 0;
    }

    // Limpa as linhas anteriores deste período antes de regravar
    await prisma.metaInsight.deleteMany({
      where: { connectionId: conn.id, dateStart: new Date(since) },
    });

    let synced = 0;
    for (const row of rows) {
      const spend      = parseFloat(row.spend ?? "0");
      const leads      = getAction(row.actions, "lead") || getAction(row.actions, "onsite_conversion.lead_grouped");
      const purchases  = getAction(row.actions, "purchase");
      const cpl        = getCost(row.cost_per_action_type, "lead") || (leads > 0 ? spend / leads : 0);
      const purchaseValue = getActionValue(row.action_values, "purchase");
      const roas       = spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0;

      await prisma.metaInsight.upsert({
        where: {
          connectionId_campaignId_adsetId_dateStart_dateStop: {
            connectionId: conn.id,
            campaignId:   row.campaign_id,
            adsetId:      row.adset_id ?? null,
            dateStart:    new Date(since),
            dateStop:     new Date(until),
          },
        },
        create: {
          connectionId: conn.id,
          campaignId:   row.campaign_id,
          campaignName: row.campaign_name,
          adsetId:      row.adset_id    ?? null,
          adsetName:    row.adset_name  ?? null,
          status:       row.status ?? "UNKNOWN",
          dateStart:    new Date(since),
          dateStop:     new Date(until),
          spend,
          impressions:  parseInt(row.impressions ?? "0"),
          reach:        parseInt(row.reach       ?? "0"),
          clicks:       parseInt(row.clicks      ?? "0"),
          ctr:          parseFloat(row.ctr       ?? "0"),
          cpm:          parseFloat(row.cpm       ?? "0"),
          cpc:          parseFloat(row.cpc       ?? "0"),
          leads:        Math.round(leads),
          cpl,
          purchases:    Math.round(purchases),
          roas,
        },
        update: {
          campaignName: row.campaign_name,
          adsetName:    row.adset_name  ?? null,
          status:       row.status ?? "UNKNOWN",
          spend,
          impressions:  parseInt(row.impressions ?? "0"),
          reach:        parseInt(row.reach       ?? "0"),
          clicks:       parseInt(row.clicks      ?? "0"),
          ctr:          parseFloat(row.ctr       ?? "0"),
          cpm:          parseFloat(row.cpm       ?? "0"),
          cpc:          parseFloat(row.cpc       ?? "0"),
          leads:        Math.round(leads),
          cpl,
          purchases:    Math.round(purchases),
          roas,
        },
      });
      synced++;
    }

    // Atualiza timestamp de última sincronização
    await prisma.metaConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({ synced, period: { since, until } });
  } catch (e) {
    if (e instanceof MetaTokenError) {
      return NextResponse.json(
        { error: "O token do Meta expirou ou foi revogado. Reconecte a conta em Anúncios.", reconnect: true },
        { status: 401 }
      );
    }
    if (e instanceof MetaRateLimitError) {
      return NextResponse.json(
        { error: "Limite de requisições da Meta atingido. Tente novamente em alguns minutos.", retry: true },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao sincronizar" },
      { status: 400 }
    );
  }
}
