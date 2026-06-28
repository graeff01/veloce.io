import { prisma } from "@/lib/prisma";
import { GOOGLE_ADS, isGoogleAdsConfigured } from "./config";

// ── OAuth: troca o refresh token por um access token de curta duração ──────────
async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS.clientId,
      client_secret: GOOGLE_ADS.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth Google falhou: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── GAQL: roda uma consulta na conta (searchStream) ───────────────────────────
async function gaql(customerId: string, accessToken: string, loginCustomerId: string | null, query: string) {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS.apiVersion}/customers/${customerId}/googleAds:searchStream`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS.developerToken,
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GAQL falhou: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Sync de campanhas + métricas de um período (YYYY-MM-DD) ───────────────────
// Motor pronto: faltam só as credenciais (env) + o refreshToken da conexão
// (concluído no OAuth). O mapeamento final do retorno entra quando a API estiver
// acessível pra validar o shape real do searchStream.
export async function syncGoogleAds(clientId: string, since: string, until: string) {
  if (!isGoogleAdsConfigured()) {
    throw new Error("Google Ads ainda não configurado — falta developer token / OAuth no .env.");
  }
  const conn = await prisma.googleConnection.findUnique({ where: { clientId } });
  if (!conn) throw new Error("Cliente sem conexão Google.");
  if (!conn.refreshToken) throw new Error("Conexão Google sem refresh token — conclua o OAuth.");

  const accessToken = await getAccessToken(conn.refreshToken);
  const run = (q: string) => gaql(conn.customerId, accessToken, conn.loginCustomerId, q);
  const range = `segments.date BETWEEN '${since}' AND '${until}'`;

  // 1) Campanhas + parcela de impressões (impression share)
  const campaignsQ = `
    SELECT campaign.id, campaign.name, campaign.status,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
           metrics.search_impression_share,
           metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE ${range}`;

  // 2) Termos de busca reais (o que a pessoa digitou)
  const searchTermsQ = `
    SELECT search_term_view.search_term,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM search_term_view
    WHERE ${range}
    ORDER BY metrics.cost_micros DESC
    LIMIT 200`;

  // 3) Palavras-chave + índice de qualidade
  const keywordsQ = `
    SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           ad_group_criterion.quality_info.quality_score,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM keyword_view
    WHERE ${range}
    ORDER BY metrics.cost_micros DESC
    LIMIT 200`;

  // 4) Histórico de mudanças (auditoria) — últimos 14 dias, quem alterou o quê
  const changesQ = `
    SELECT change_event.change_date_time, change_event.user_email,
           change_event.change_resource_type, change_event.resource_change_operation,
           change_event.changed_fields, change_event.resource_name
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_14_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 200`;

  // 5) Diagnóstico — anúncios reprovados pela política
  const disapprovedQ = `
    SELECT ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status, campaign.name
    FROM ad_group_ad
    WHERE ad_group_ad.policy_summary.approval_status = 'DISAPPROVED'`;

  // 6) Diagnóstico — rastreamento de conversão (há ação de conversão ativa?)
  const conversionQ = `
    SELECT conversion_action.name, conversion_action.status, conversion_action.type
    FROM conversion_action`;

  const [campaigns, searchTerms, keywords, changes, disapproved, conversions] = await Promise.all([
    run(campaignsQ), run(searchTermsQ), run(keywordsQ), run(changesQ), run(disapprovedQ), run(conversionQ),
  ]);

  // TODO(credenciais): mapear os streams → upsert nas tabelas. Para auditoria:
  // changes → GoogleChangeEvent; disapproved/conversions + lostBudget (impression share)
  // → GoogleDiagnostic. metrics.cost_micros / 1e6 = custo; impression share = fração 0–1.
  // Shapes validados quando a conta estiver acessível.

  await prisma.googleConnection.update({ where: { clientId }, data: { lastSyncAt: new Date() } });
  return { campaigns, searchTerms, keywords, changes, disapproved, conversions };
}
