import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { token, adAccountId } = await req.json();

  if (!token || !adAccountId) {
    return NextResponse.json({ error: "Token e adAccountId obrigatórios" }, { status: 400 });
  }

  // Testa permissões
  const accountUrl = new URL(`https://graph.facebook.com/v21.0/${adAccountId}`);
  accountUrl.searchParams.append("fields", "name,currency,account_status");

  const accountRes = await fetch(accountUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const accountData = await accountRes.json();

  // Testa insights
  const insightsUrl = new URL(`https://graph.facebook.com/v21.0/${adAccountId}/insights`);
  insightsUrl.searchParams.append("fields", "spend,impressions");
  insightsUrl.searchParams.append("date_preset", "last_30d");

  const insightsRes = await fetch(insightsUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const insightsData = await insightsRes.json();

  return NextResponse.json({
    token: token.substring(0, 20) + "...",
    adAccountId,
    account: {
      status: accountRes.status,
      ok: accountRes.ok,
      error: accountData.error ? { message: accountData.error.message, code: accountData.error.code } : null,
      data: accountData.error ? null : { name: accountData.name, currency: accountData.currency },
    },
    insights: {
      status: insightsRes.status,
      ok: insightsRes.ok,
      error: insightsData.error ? { message: insightsData.error.message, code: insightsData.error.code } : null,
      hasData: insightsData.error ? false : insightsData.data?.length > 0,
    },
  });
}
