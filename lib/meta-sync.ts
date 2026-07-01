import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

// ── Sync oficial da Meta Marketing API (por IDs) ─────────────────────────────
// Espelha a estrutura (Campaign → AdSet → Ad → Creative) e os insights diários
// em nível de ANÚNCIO para as tabelas dimensionais. Tudo por ID oficial — base
// da atribuição determinística. Nenhuma lógica depende de nome.

const GRAPH = "https://graph.facebook.com/v21.0";

export class MetaTokenError extends Error {}
export class MetaRateLimitError extends Error {}

interface GraphPage<T> { data: T[]; paging?: { next?: string } }

// GET paginado com tratamento de erro oficial da Meta (190 = token, 17/80004 = rate).
async function graphGetAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  let guard = 0;
  while (next && guard++ < 50) {
    const res = await fetch(next);
    const json = (await res.json()) as GraphPage<T> & { error?: { code?: number; type?: string; message?: string } };
    if (!res.ok || json.error) {
      const err = json.error;
      // Apenas code 190 = token. type OAuthException também cobre erros de query
      // inválida (#100), que não devem ser tratados como token expirado.
      if (err?.code === 190) {
        throw new MetaTokenError(err?.message ?? "Token Meta expirado/revogado");
      }
      if (err?.code === 17 || err?.code === 80004 || err?.code === 4) {
        throw new MetaRateLimitError(err?.message ?? "Rate limit da Meta atingido");
      }
      throw new Error(err?.message ?? "Erro na Graph API");
    }
    out.push(...(json.data ?? []));
    next = json.paging?.next;
  }
  return out;
}

// Resiliente: tenta os campos ENRIQUECIDOS; se a Meta recusar um campo novo
// (erro de query, não token/limite), cai para os campos-BASE — o sync nunca
// morre por um campo indisponível. Loga qual caiu (observabilidade).
async function graphGetAllResilient<T>(enriched: string, base: string, label: string): Promise<T[]> {
  try {
    return await graphGetAll<T>(enriched);
  } catch (e) {
    if (e instanceof MetaTokenError || e instanceof MetaRateLimitError) throw e;
    console.warn(`[meta-sync] campos enriquecidos falharam em ${label} — usando base:`, e instanceof Error ? e.message : e);
    return graphGetAll<T>(base);
  }
}

function getAction(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  if (!actions) return 0;
  const f = actions.find((a) => a.action_type === type);
  return f ? parseFloat(f.value) : 0;
}

// Executa upserts em lotes concorrentes — paraleliza dentro do chunk (o pool do
// Prisma serializa o excedente), reduzindo o tempo total sem estourar conexões.
const CHUNK = 25;
async function runChunked<T>(items: T[], make: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK) {
    await Promise.all(items.slice(i, i + CHUNK).map(make));
  }
}

interface CampaignRow {
  id: string; name: string; objective?: string; effective_status?: string;
  created_time?: string; daily_budget?: string; lifetime_budget?: string;
}
interface AdSetRow {
  id: string; name: string; effective_status?: string; campaign_id: string;
  created_time?: string; daily_budget?: string; lifetime_budget?: string;
  destination_type?: string;
  learning_stage_info?: { status?: string };
}
interface AdRow {
  id: string; name: string; effective_status?: string; adset_id: string; campaign_id: string;
  created_time?: string; creative?: { id: string };
}
interface CreativeRow {
  id: string; name?: string; title?: string; body?: string; thumbnail_url?: string;
  object_story_spec?: unknown; asset_feed_spec?: unknown;
}
interface AdInsightRow {
  ad_id: string; date_start: string;
  spend?: string; impressions?: string; reach?: string; clicks?: string;
  ctr?: string; cpc?: string; cpm?: string; frequency?: string;
  actions?: { action_type: string; value: string }[];
}
interface AdRankingRow {
  ad_id: string;
  quality_ranking?: string; engagement_rate_ranking?: string; conversion_rate_ranking?: string;
}

// Ranking só é útil quando a Meta tem volume — "UNKNOWN" vira null (nada a dizer).
function ranking(v: string | undefined): string | null {
  return v && v !== "UNKNOWN" ? v : null;
}

// Orçamento Meta vem em centavos (string) da moeda da conta → reais.
function budget(v: string | undefined): number | null {
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n / 100 : null;
}

// created_time ISO → Date. Nulo se ausente/ inválido.
function startedAt(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Extrai o número de WhatsApp de destino de um anúncio Click-to-WhatsApp.
// O número aparece embutido em links wa.me / api.whatsapp.com dentro do criativo
// (object_story_spec / asset_feed_spec). Best-effort: varre o JSON do criativo.
function extractWhatsappNumber(creative: CreativeRow | undefined): string | null {
  if (!creative) return null;
  const blob = JSON.stringify(creative.object_story_spec ?? "") + JSON.stringify(creative.asset_feed_spec ?? "");
  const m = blob.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?[^"']*?phone=|whatsapp\.com\/[^"']*?phone=)(\d{8,15})/i);
  return m ? m[1] : null;
}

// Imagem em alta + id do vídeo do criativo (object_story_spec / asset_feed_spec).
// Best-effort: varre os specs por "video_id" e por uma "image_url"/"picture" de
// resolução decente. Nunca lança — cai para a thumbnail quando não acha nada.
function extractMedia(creative: CreativeRow | undefined): { imageUrl: string | null; videoId: string | null } {
  if (!creative) return { imageUrl: null, videoId: null };
  const blob = JSON.stringify(creative.object_story_spec ?? "") + JSON.stringify(creative.asset_feed_spec ?? "");
  const vid = blob.match(/"video_id"\s*:\s*"(\d+)"/);
  // Prioriza image_url (alta) e picture; ignora as p64x64 (thumb minúscula).
  const img = blob.match(/"image_url"\s*:\s*"([^"]+)"/) || blob.match(/"picture"\s*:\s*"([^"]+)"/);
  const imageUrl = img ? img[1].replace(/\\\//g, "/") : null;
  return { imageUrl, videoId: vid ? vid[1] : null };
}

export interface MetaSyncResult {
  campaigns: number; adsets: number; ads: number; creatives: number; insightDays: number;
  period: { since: string; until: string };
}

// Sincroniza estrutura + insights diários (level=ad) de uma conexão Meta.
export async function syncMetaAds(connectionId: string, since: string, until: string): Promise<MetaSyncResult> {
  const conn = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("Conexão Meta não encontrada");

  const token = decryptSecret(conn.accessToken);
  const acct = conn.adAccountId; // formato act_<id>
  const auth = `access_token=${encodeURIComponent(token)}`;

  // 1) Estrutura — sempre por ID oficial.
  // Sem effective_status, a Meta esconde ARCHIVED/PAUSED por padrão — então um
  // anúncio arquivado que gastou aparecia com gasto (vem do /insights) mas sem
  // nome/campanha (não vinha do /ads) → "Campanha não sincronizada / UNKNOWN".
  // Passamos a lista explícita (inclui ARCHIVED) por endpoint, sem DELETED para
  // não inflar com objetos antigos. Valores válidos no enum oficial da Meta.
  const CAMPAIGN_STATUS = ["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"];
  const ADSET_STATUS = ["ACTIVE", "PAUSED", "ARCHIVED", "CAMPAIGN_PAUSED", "IN_PROCESS", "WITH_ISSUES"];
  const AD_STATUS = ["ACTIVE", "PAUSED", "ARCHIVED", "ADSET_PAUSED", "CAMPAIGN_PAUSED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO", "IN_PROCESS", "WITH_ISSUES"];
  const es = (vals: string[]) => `effective_status=${encodeURIComponent(JSON.stringify(vals))}`;

  // Campos base (garantidos) × enriquecidos (campos novos). Cada chamada cai para
  // o base se a Meta recusar algum campo novo — o sync NUNCA morre por isso.
  const C_BASE = "id,name,objective,effective_status";
  const S_BASE = "id,name,effective_status,campaign_id";
  const A_BASE = "id,name,effective_status,adset_id,campaign_id,creative{id}";
  const CR_BASE = "id,name,title,body,thumbnail_url";
  const [campaigns, adsets, ads] = await Promise.all([
    graphGetAllResilient<CampaignRow>(
      `${GRAPH}/${acct}/campaigns?fields=${C_BASE},created_time,daily_budget,lifetime_budget&${es(CAMPAIGN_STATUS)}&limit=200&${auth}`,
      `${GRAPH}/${acct}/campaigns?fields=${C_BASE}&${es(CAMPAIGN_STATUS)}&limit=200&${auth}`, "campaigns"),
    graphGetAllResilient<AdSetRow>(
      `${GRAPH}/${acct}/adsets?fields=${S_BASE},created_time,daily_budget,lifetime_budget,destination_type,learning_stage_info&${es(ADSET_STATUS)}&limit=200&${auth}`,
      `${GRAPH}/${acct}/adsets?fields=${S_BASE}&${es(ADSET_STATUS)}&limit=200&${auth}`, "adsets"),
    graphGetAllResilient<AdRow>(
      `${GRAPH}/${acct}/ads?fields=${A_BASE},created_time&${es(AD_STATUS)}&limit=300&${auth}`,
      `${GRAPH}/${acct}/ads?fields=${A_BASE}&${es(AD_STATUS)}&limit=300&${auth}`, "ads"),
  ]);

  const creativeIds = [...new Set(ads.map((a) => a.creative?.id).filter((x): x is string => !!x))];
  // Criativos: object_story_spec/asset_feed_spec trazem o link CTWA do nº WhatsApp.
  // São pesados — se falharem, cai para o base (sem nº WhatsApp) sem derrubar o sync.
  const creatives = creativeIds.length
    ? await graphGetAllResilient<CreativeRow>(
        `${GRAPH}/${acct}/adcreatives?fields=${CR_BASE},object_story_spec,asset_feed_spec&limit=200&${auth}`,
        `${GRAPH}/${acct}/adcreatives?fields=${CR_BASE}&limit=300&${auth}`, "adcreatives")
    : [];
  const waByCreative = new Map<string, string | null>();
  const mediaByCreative = new Map<string, { imageUrl: string | null; videoId: string | null }>();
  for (const cr of creatives) { waByCreative.set(cr.id, extractWhatsappNumber(cr)); mediaByCreative.set(cr.id, extractMedia(cr)); }

  // 2) Insights diários em nível de anúncio (frequency cai para base se recusado).
  const timeRange = `{"since":"${since}","until":"${until}"}`;
  const I_BASE = "ad_id,spend,impressions,reach,clicks,ctr,cpc,cpm,actions";
  const insights = await graphGetAllResilient<AdInsightRow>(
    `${GRAPH}/${acct}/insights?level=ad&fields=${I_BASE.replace("cpm,", "cpm,frequency,")}&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=500&${auth}`,
    `${GRAPH}/${acct}/insights?level=ad&fields=${I_BASE}&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=500&${auth}`, "insights");

  // Ranking de relevância (snapshot, não diário) — ISOLADO: best-effort, nunca
  // derruba o sync. Token expirado ainda propaga.
  let rankingRows: AdRankingRow[] = [];
  try {
    rankingRows = await graphGetAll<AdRankingRow>(
      `${GRAPH}/${acct}/insights?level=ad&fields=ad_id,quality_ranking,engagement_rate_ranking,conversion_rate_ranking` +
      `&time_range=${encodeURIComponent(timeRange)}&limit=500&${auth}`,
    );
  } catch (e) {
    if (e instanceof MetaTokenError) throw e;
    console.warn("[meta-sync] ranking de relevância indisponível:", e instanceof Error ? e.message : e);
  }
  const rankByAd = new Map(rankingRows.map((r) => [r.ad_id, r]));

  // 3) Persistência (upsert por ID oficial — imune a renomeação).
  // Em transações por lote (chunks) para reduzir round-trips e evitar timeout
  // em contas grandes (centenas de anúncios × dias).
  const now = new Date();

  await runChunked(campaigns, (c) => {
    const extra = { startedAt: startedAt(c.created_time), dailyBudget: budget(c.daily_budget), lifetimeBudget: budget(c.lifetime_budget) };
    return prisma.metaCampaign.upsert({
      where: { connectionId_campaignId: { connectionId, campaignId: c.id } },
      create: { connectionId, campaignId: c.id, name: c.name, objective: c.objective ?? null, status: c.effective_status ?? "UNKNOWN", ...extra },
      update: { name: c.name, objective: c.objective ?? null, status: c.effective_status ?? "UNKNOWN", ...extra, updatedAt: now },
    });
  });

  await runChunked(adsets, (a) => {
    const extra = {
      startedAt: startedAt(a.created_time), dailyBudget: budget(a.daily_budget), lifetimeBudget: budget(a.lifetime_budget),
      learningStage: a.learning_stage_info?.status ?? null, destinationType: a.destination_type ?? null,
    };
    return prisma.metaAdSet.upsert({
      where: { connectionId_adsetId: { connectionId, adsetId: a.id } },
      create: { connectionId, adsetId: a.id, campaignId: a.campaign_id, name: a.name, status: a.effective_status ?? "UNKNOWN", ...extra },
      update: { campaignId: a.campaign_id, name: a.name, status: a.effective_status ?? "UNKNOWN", ...extra, updatedAt: now },
    });
  });

  await runChunked(creatives, (cr) =>
    prisma.metaCreative.upsert({
      where: { connectionId_creativeId: { connectionId, creativeId: cr.id } },
      create: { connectionId, creativeId: cr.id, name: cr.name ?? null, title: cr.title ?? null, body: cr.body ?? null, thumbnailUrl: cr.thumbnail_url ?? null, imageUrl: mediaByCreative.get(cr.id)?.imageUrl ?? null, videoId: mediaByCreative.get(cr.id)?.videoId ?? null },
      update: { name: cr.name ?? null, title: cr.title ?? null, body: cr.body ?? null, thumbnailUrl: cr.thumbnail_url ?? null, imageUrl: mediaByCreative.get(cr.id)?.imageUrl ?? null, videoId: mediaByCreative.get(cr.id)?.videoId ?? null, updatedAt: now },
    }),
  );

  await runChunked(ads, (a) => {
    const rk = rankByAd.get(a.id);
    const extra = {
      startedAt: startedAt(a.created_time),
      whatsappNumber: a.creative?.id ? (waByCreative.get(a.creative.id) ?? null) : null,
      qualityRanking: ranking(rk?.quality_ranking),
      engagementRanking: ranking(rk?.engagement_rate_ranking),
      conversionRanking: ranking(rk?.conversion_rate_ranking),
    };
    return prisma.metaAd.upsert({
      where: { connectionId_adId: { connectionId, adId: a.id } },
      create: { connectionId, adId: a.id, adsetId: a.adset_id, campaignId: a.campaign_id, creativeId: a.creative?.id ?? null, name: a.name, status: a.effective_status ?? "UNKNOWN", ...extra },
      update: { adsetId: a.adset_id, campaignId: a.campaign_id, creativeId: a.creative?.id ?? null, name: a.name, status: a.effective_status ?? "UNKNOWN", ...extra, updatedAt: now },
    });
  });

  await runChunked(insights, (ins) => {
    const date = new Date(`${ins.date_start}T00:00:00.000Z`);
    const leads = getAction(ins.actions, "onsite_conversion.total_messaging_connection")
      || getAction(ins.actions, "onsite_conversion.messaging_conversation_started_7d")
      || getAction(ins.actions, "lead");
    const data = {
      spend: parseFloat(ins.spend ?? "0"),
      impressions: parseInt(ins.impressions ?? "0"),
      reach: parseInt(ins.reach ?? "0"),
      clicks: parseInt(ins.clicks ?? "0"),
      ctr: parseFloat(ins.ctr ?? "0"),
      cpc: parseFloat(ins.cpc ?? "0"),
      cpm: parseFloat(ins.cpm ?? "0"),
      frequency: parseFloat(ins.frequency ?? "0"),
      leads: Math.round(leads),
    };
    return prisma.metaAdInsight.upsert({
      where: { connectionId_adId_date: { connectionId, adId: ins.ad_id, date } },
      create: { connectionId, adId: ins.ad_id, date, ...data },
      update: { ...data, updatedAt: now },
    });
  });

  await prisma.metaConnection.update({ where: { id: connectionId }, data: { lastAdSyncAt: now } });

  return {
    campaigns: campaigns.length,
    adsets: adsets.length,
    ads: ads.length,
    creatives: creatives.length,
    insightDays: insights.length,
    period: { since, until },
  };
}
