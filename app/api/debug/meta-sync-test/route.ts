import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  const auth = await requireAuth("clients:update");
  if (auth.error) {
    return NextResponse.json({ step: "auth", failed: true, message: "requireAuth retornou erro" }, { status: 200 });
  }

  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const conn = await prisma.metaConnection.findUnique({ where: { clientId } });
  if (!conn) return NextResponse.json({ step: "connection", failed: true }, { status: 200 });

  const accessToken = decryptSecret(conn.accessToken);
  const now = new Date();
  const since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const until = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // QUERY EXATA de insights que o sync faz
  const fields = "campaign_id,campaign_name,adset_id,adset_name,objective,status,spend,impressions,reach,clicks,ctr,cpm,cpc,actions,action_values,cost_per_action_type";
  const insightsUrl = new URL(`https://graph.facebook.com/v21.0/${conn.adAccountId}/insights`);
  insightsUrl.searchParams.set("fields", fields);
  insightsUrl.searchParams.set("time_range", JSON.stringify({ since, until }));
  insightsUrl.searchParams.set("level", "adset");
  insightsUrl.searchParams.set("time_increment", "all_days");
  insightsUrl.searchParams.set("limit", "200");
  insightsUrl.searchParams.set("access_token", accessToken);

  const res = await fetch(insightsUrl.toString());
  const data = await res.json();

  return NextResponse.json({
    period: { since, until },
    adAccountId: conn.adAccountId,
    insightsQuery: {
      httpStatus: res.status,
      ok: res.ok,
      // ERRO CRU da Meta — é isso que precisamos ver
      rawError: data.error ?? null,
      rowCount: data.data?.length ?? 0,
    },
  });
}
