"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Zap, RefreshCw, Loader2, X, TrendingUp, TrendingDown,
  Eye, MousePointer, DollarSign, Link2,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, Pause, Play,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MetaInsight {
  id: string;
  campaignId: string;
  campaignName: string;
  adsetName: string | null;
  status: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  leads: number;
  cpl: number;
  purchases: number;
  roas: number;
}

interface TokenStatus {
  valid: boolean;
  type: string | null;
  isSystemUser: boolean;
  expiresAt: string | null;
}

interface MetaConnection {
  id: string;
  adAccountId: string;
  accountName: string | null;
  currency: string | null;
  lastSyncAt: string | null;
  insights: MetaInsight[];
  tokenStatus?: TokenStatus | null;
}

// Visão dimensional (campanhas + anúncios com leads reais) — /meta/ads
interface AdRow {
  adId: string; name: string; campaignId: string; campaignName: string; status: string;
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
  leads: number; metaLeads: number; cpl: number | null;
  startedAt: string | null; dailyBudget: number | null; learningStage: string | null;
  frequency: number | null; whatsappNumber: string | null; destinationType: string | null;
  qualityRanking: string | null; engagementRanking: string | null; conversionRanking: string | null;
  thumbnailUrl: string | null;
}
interface CampaignRow {
  campaignId: string; name: string; status: string;
  spend: number; impressions: number; clicks: number; ctr: number;
  leads: number; metaLeads: number; cpl: number | null;
  startedAt: string | null; dailyBudget: number | null; lifetimeBudget: number | null;
}
interface AdsView {
  connected: boolean; hasData: boolean;
  totals: { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; leads: number; metaLeads: number; cpl: number | null };
  campaigns: CampaignRow[];
  ads: AdRow[];
  leadsSemIdentificacao: number;
  connectedNumber: string | null;
  prevTotals: { spend: number; leads: number; cpl: number | null; ctr: number; clicks: number; impressions: number } | null;
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number, decimals = 2) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}
// Conversão real: % dos cliques pagos que viraram lead real no WhatsApp.
function convLead(leads: number, clicks: number) {
  return clicks > 0 ? `${((leads / clicks) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
}

function statusColor(s: string) {
  if (s === "ACTIVE")        return { color: "#16A34A", bg: "rgba(22,163,74,0.1)",   label: "Ativo"     };
  if (s === "ARCHIVED")      return { color: "#64748B", bg: "rgba(100,116,139,0.1)", label: "Arquivado" };
  if (s.includes("PAUSED"))  return { color: "#D97706", bg: "rgba(217,119,6,0.1)",   label: "Pausado"   };
  return                            { color: "#64748B", bg: "rgba(100,116,139,0.1)", label: s           };
}
// Só "ACTIVE" entrega de verdade; o resto (pausado/arquivado) sai da visão principal.
const isActiveStatus = (s: string) => s === "ACTIVE";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}

// Idade (dias) a partir do created_time da Meta.
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d >= 0 ? d : null;
}
const onlyDigits = (s: string | null) => (s ?? "").replace(/\D/g, "");
// Quais dimensões de relevância estão ABAIXO da média (Meta).
function belowRanking(a: AdRow): string[] {
  const out: string[] = [];
  if (a.qualityRanking?.startsWith("BELOW_AVERAGE")) out.push("qualidade");
  if (a.engagementRanking?.startsWith("BELOW_AVERAGE")) out.push("engajamento");
  if (a.conversionRanking?.startsWith("BELOW_AVERAGE")) out.push("conversão");
  return out;
}
const LEARNING_LABEL: Record<string, string> = { LEARNING: "Aprendizado", LEARNING_LIMITED: "Aprend. limitado" };
// Destino do clique leva ao WhatsApp? (sem info = não sinaliza)
const isWhatsappDest = (d: string | null) => !d || d.includes("WHATSAPP");
const DEST_LABEL: Record<string, string> = {
  INSTAGRAM_PROFILE: "Perfil Instagram", MESSENGER: "Messenger", ON_AD: "no próprio anúncio",
  WEBSITE: "site", PHONE_CALL: "ligação", APP: "app", UNDEFINED: "indefinido",
};
const destLabel = (d: string) => DEST_LABEL[d] ?? d.toLowerCase().replace(/_/g, " ");

// ── Main ───────────────────────────────────────────────────────────────────────

export function AdsTab({ clientId }: { clientId: string }) {
  const now = new Date();
  const [conn, setConn]         = useState<MetaConnection | null>(null);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError]       = useState("");
  const [year, setYear]         = useState(now.getFullYear());
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [ads, setAds]           = useState<AdsView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/meta`);
    if (res.ok) {
      const data = await res.json();
      setConn(data);
    }
    setLoading(false);
  }, [clientId]);

  const loadAds = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/meta/ads?year=${year}&month=${month}`);
    if (r.ok) setAds(await r.json());
  }, [clientId, year, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (conn) loadAds(); }, [conn, loadAds]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    // Sincroniza o MÊS SELECIONADO (não só o atual) — permite puxar histórico.
    const pad = (n: number) => String(n).padStart(2, "0");
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate();
    const since = `${year}-${pad(month)}-01`;
    const until = `${year}-${pad(month)}-${pad(lastDay)}`;
    const period = JSON.stringify({ since, until });

    // Insights agregados (campanha/adset) + estrutura/insights por ad_id
    // (base da atribuição determinística e do CPL real do portal).
    const [res, adsRes] = await Promise.all([
      fetch(`/api/clients/${clientId}/meta/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: period }),
      fetch(`/api/clients/${clientId}/meta/sync-ads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: period }).catch(() => null),
    ]);
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Erro ao sincronizar");
    else {
      // A sincronização de anúncios (estrutura/campos novos) NÃO pode falhar em
      // silêncio — era o que escondia campos não populados.
      if (!adsRes || !adsRes.ok) {
        const adsErr = adsRes ? (await adsRes.json().catch(() => null))?.error : null;
        setError(adsErr ?? "Os insights atualizaram, mas a sincronização de anúncios falhou. Tente sincronizar de novo.");
      }
      await load(); await loadAds();
    }
    setSyncing(false);
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar conta Meta? Os dados sincronizados serão removidos.")) return;
    await fetch(`/api/clients/${clientId}/meta`, { method: "DELETE" });
    setConn(null);
  }

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!conn) return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", padding: "32px 28px", display: "flex", flexDirection: "column", gap: 32 }}>
      {showSetup
        ? <SetupForm clientId={clientId} onSaved={() => { setShowSetup(false); load(); }} onCancel={() => setShowSetup(false)} />
        : (
          <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", paddingTop: 48 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(24,119,242,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              Conectar Meta Ads
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 28 }}>
              Conecte a conta de anúncios do cliente para acompanhar campanhas, gasto, CPL, CTR e muito mais — atualizado automaticamente.
            </p>

            {/* Steps */}
            <div style={{ textAlign: "left", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Como conectar</p>
              {[
                "Cliente acessa o Business Manager do Meta",
                "Configurações → Usuários do sistema → Criar usuário",
                "Adicionar à Conta de Anúncios com permissão de leitura",
                "Gerar token e copiar ID da conta (act_XXXXXXXX)",
                "Colar aqui — pronto!",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(24,119,242,0.1)", color: "#1877F2", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{step}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSetup(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 10, border: "none", background: "#1877F2", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", margin: "0 auto" }}
            >
              <Link2 size={14} /> Conectar conta de anúncios
            </button>
          </div>
        )
      }
    </div>
  );

  // ── Atualizar token (mesma conta, sem desconectar/perder dados) ──
  if (showSetup) return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", padding: "32px 28px" }}>
      <SetupForm
        clientId={clientId}
        initialAccountId={conn.adAccountId}
        onSaved={() => { setShowSetup(false); setError(""); load(); }}
        onCancel={() => setShowSetup(false)}
      />
    </div>
  );

  // ── Connected ──────────────────────────────────────────────────────────────
  const t = ads?.totals;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>

      {/* ── Header ── */}
      <div style={{ padding: "18px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(24,119,242,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              {conn.accountName ?? conn.adAccountId}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
              {conn.adAccountId}
              {conn.lastSyncAt && <span> · Sincronizado {timeAgo(conn.lastSyncAt)}</span>}
            </p>
          </div>
          {conn.tokenStatus && <TokenBadge s={conn.tokenStatus} />}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            {syncing ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />}
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </button>
          <button
            onClick={() => setShowSetup(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            <Link2 size={12} /> Atualizar token
          </button>
          <button
            onClick={handleDisconnect}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}
          >
            <X size={12} /> Desconectar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: "16px 28px 0", padding: "10px 14px", borderRadius: 9, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", fontSize: 12, color: "#DC2626", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Seletor de período + exportar relatório */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
            {[0, 1, 2].map((d) => { const y = now.getFullYear() - d; return <option key={y} value={y}>{y}</option>; })}
          </select>
          <a
            href={`/api/clients/${clientId}/meta/report?year=${year}&month=${month}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}
          >
            <FileText size={14} /> Exportar relatório (PDF)
          </a>
        </div>

        {!ads ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
          </div>
        ) : !ads.hasData ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Zap size={32} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>Nenhum anúncio com dados neste período</p>
            <button onClick={handleSync} disabled={syncing} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {syncing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />}
              Sincronizar agora
            </button>
          </div>
        ) : t && (
          <>
            {/* ── KPIs (só o que importa) + tendência vs mês anterior ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <MetaKpi label="Investimento"  value={fmtBRL(t.spend)}                       icon={<DollarSign size={14} color="#DC2626" />}  bg="rgba(220,38,38,0.08)"  trend={{ pct: growth(t.spend, ads?.prevTotals?.spend) }} />
              <MetaKpi label="Leads reais"   value={String(t.leads)}                       icon={<TrendingUp size={14} color="#16A34A" />}   bg="rgba(22,163,74,0.08)"  trend={{ pct: growth(t.leads, ads?.prevTotals?.leads), goodWhenUp: true }} />
              <MetaKpi label="CPL real"      value={t.cpl != null ? fmtBRL(t.cpl) : "—"}   icon={<TrendingDown size={14} color="#D97706" />} bg="rgba(217,119,6,0.08)" trend={{ pct: growth(t.cpl, ads?.prevTotals?.cpl), goodWhenUp: false }} />
              <MetaKpi label="CTR"           value={`${fmt(t.ctr)}%`}                      icon={<MousePointer size={14} color="#2563EB" />} bg="rgba(37,99,235,0.08)"  trend={{ pct: growth(t.ctr, ads?.prevTotals?.ctr), goodWhenUp: true }} />
              <MetaKpi label="Impressões"    value={fmtK(t.impressions)}                   icon={<Eye size={14} color="#0891B2" />}          bg="rgba(8,145,178,0.08)"  trend={{ pct: growth(t.impressions, ads?.prevTotals?.impressions) }} />
              <MetaKpi label="Cliques"       value={fmtK(t.clicks)}                        icon={<MousePointer size={14} color="#059669" />} bg="rgba(5,150,105,0.08)"  trend={{ pct: growth(t.clicks, ads?.prevTotals?.clicks), goodWhenUp: true }} />
            </div>

            {/* ── Campanhas (expande anúncios) ── */}
            <CampaignAccordion clientId={clientId} campaigns={ads.campaigns} ads={ads.ads} connectedNumber={ads.connectedNumber} />

            {ads.leadsSemIdentificacao > 0 && (
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "-8px 2px 0" }}>
                {ads.leadsSemIdentificacao} lead(s) de anúncio sem identificação de campanha (origem não reconhecida) não entram nas linhas acima.
              </p>
            )}
          </>
        )}

      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = { height: 34, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer" };

// Saúde do token: verde = System User válido (não expira); amarelo = válido mas
// expira (token de usuário); vermelho = inválido/revogado.
function TokenBadge({ s }: { s: TokenStatus }) {
  let color = "#16A34A", bg = "rgba(22,163,74,0.1)", label = "Token OK";
  if (!s.valid) { color = "#DC2626"; bg = "rgba(220,38,38,0.1)"; label = "Token inválido"; }
  else if (!s.isSystemUser) { color = "#D97706"; bg = "rgba(217,119,6,0.1)"; label = "Token expira"; }
  else if (s.expiresAt) { color = "#D97706"; bg = "rgba(217,119,6,0.1)"; label = "Expira"; }
  const title = s.valid
    ? `${s.isSystemUser ? "System User" : "Usuário"}${s.expiresAt ? ` · expira ${new Date(s.expiresAt).toLocaleDateString("pt-BR")}` : " · não expira"}`
    : "Token revogado ou expirado — use Atualizar token";
  return (
    <span title={title} style={{ fontSize: 10.5, fontWeight: 600, color, background: bg, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
      ● {label}
    </span>
  );
}

// Accordion: campanhas; clicar expande os anúncios da campanha (fechado por padrão).
const COLS = "20px 1.8fr 90px 110px 80px 70px 80px 70px 90px";

// Linha de um anúncio (reusada na visão principal e no menu de pausados/arquivados).
function AdRow_({ a, connectedNumber, dim }: { a: AdRow; connectedNumber: string | null; dim?: boolean }) {
  const ast = statusColor(a.status);
  return (
    <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "10px 16px", alignItems: "center", background: "var(--bg-elevated)", borderTop: "1px solid var(--border)", opacity: dim ? 0.65 : 1 }}>
      <span />
      <div style={{ minWidth: 0, paddingLeft: 8, borderLeft: "2px solid var(--border-strong)", display: "flex", gap: 9, alignItems: "flex-start" }}>
        {a.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.thumbnailUrl}
            alt=""
            width={34}
            height={34}
            style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</p>
          <AdMetaChips a={a} connectedNumber={connectedNumber} />
        </div>
      </div>
      <span><span style={{ fontSize: 10, fontWeight: 600, color: ast.color, background: ast.bg, padding: "2px 7px", borderRadius: 20 }}>{ast.label}</span></span>
      <Cell v={fmtBRL(a.spend)} />
      <Cell v={fmtK(a.impressions)} />
      <Cell v={fmtK(a.clicks)} />
      <Cell v={convLead(a.leads, a.clicks)} />
      <Cell v={a.leads} leads />
      <Cell v={a.cpl != null ? fmtBRL(a.cpl) : "—"} />
    </div>
  );
}

function CampaignAccordion({ clientId, campaigns, ads, connectedNumber }: { clientId: string; campaigns: CampaignRow[]; ads: AdRow[]; connectedNumber: string | null }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showInactiveAds, setShowInactiveAds] = useState<Record<string, boolean>>({});
  const [showInactiveCamps, setShowInactiveCamps] = useState(false);
  // Override otimista do status após pausar/reativar (o próximo sync confirma).
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const adsByCampaign = new Map<string, AdRow[]>();
  for (const a of ads) {
    const arr = adsByCampaign.get(a.campaignId) ?? [];
    arr.push(a);
    adsByCampaign.set(a.campaignId, arr);
  }

  // Status DERIVADO da entrega real (a Meta mantém a campanha "ACTIVE" mesmo com
  // conjuntos pausados). Override otimista tem prioridade após o toggle.
  function deriveStatus(c: CampaignRow): string {
    const myAds = adsByCampaign.get(c.campaignId) ?? [];
    if (myAds.some((a) => isActiveStatus(a.status))) return "ACTIVE";
    if (myAds.length > 0 && myAds.every((a) => a.status === "ARCHIVED")) return "ARCHIVED";
    return "PAUSED";
  }
  const effStatus = (c: CampaignRow) => statusOverride[c.campaignId] ?? deriveStatus(c);

  async function toggleCampaign(c: CampaignRow, cur: string) {
    const next = cur === "ACTIVE" ? "PAUSED" : "ACTIVE";
    if (!confirm(`${next === "PAUSED" ? "Pausar" : "Reativar"} a campanha "${c.name}" na Meta?`)) return;
    setBusy(c.campaignId);
    try {
      const res = await fetch(`/api/clients/${clientId}/meta/campaign-status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: c.campaignId, status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? "Erro ao atualizar a campanha na Meta."); return; }
      setStatusOverride((o) => ({ ...o, [c.campaignId]: next }));
    } finally {
      setBusy(null);
    }
  }

  // Campanha "ativa" = entrega real ativa (respeitando override). As demais vão
  // para o menu recolhido.
  const activeCampaigns = campaigns.filter((c) => effStatus(c) === "ACTIVE");
  const inactiveCampaigns = campaigns.filter((c) => effStatus(c) !== "ACTIVE");

  // Renderiza UMA campanha. allAds=true mostra todos os anúncios (usado no menu de
  // pausados); senão mostra só os ativos + um expandir para os inativos da campanha.
  function renderCampaign(c: CampaignRow, allAds: boolean) {
    const myAds = adsByCampaign.get(c.campaignId) ?? [];
    const eff = effStatus(c);
    const st = statusColor(eff);
    const activeAds = myAds.filter((a) => isActiveStatus(a.status));
    const inactiveAds = myAds.filter((a) => !isActiveStatus(a.status));
    const visibleAds = allAds ? myAds : activeAds;
    const shownCount = allAds ? myAds.length : activeAds.length;
    const canExpand = visibleAds.length > 0 || (!allAds && inactiveAds.length > 0);
    const isOpen = !!open[c.campaignId];
    const revealInactive = !!showInactiveAds[c.campaignId];
    return (
      <div key={c.campaignId} style={{ borderBottom: "1px solid var(--border)" }}>
        {/* Linha da campanha */}
        <div
          onClick={() => canExpand && setOpen((o) => ({ ...o, [c.campaignId]: !o[c.campaignId] }))}
          style={{ display: "grid", gridTemplateColumns: COLS, padding: "12px 16px", alignItems: "center", cursor: canExpand ? "pointer" : "default", transition: "background 120ms" }}
          onMouseEnter={(e) => { if (canExpand) e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ display: "flex", color: "var(--text-muted)" }}>
            {canExpand ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "2px 0 0" }}>
              {[
                shownCount > 0 ? `${shownCount} anúncio${shownCount > 1 ? "s" : ""}${allAds ? "" : " ativo" + (shownCount > 1 ? "s" : "")}` : null,
                daysSince(c.startedAt) != null ? `há ${daysSince(c.startedAt)}d` : null,
                c.dailyBudget ? `${fmtBRL(c.dailyBudget)}/dia` : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "2px 7px", borderRadius: 20 }}>{st.label}</span>
            {(eff === "ACTIVE" || eff === "PAUSED") && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleCampaign(c, eff); }}
                disabled={busy === c.campaignId}
                title={eff === "ACTIVE" ? "Pausar campanha na Meta" : "Reativar campanha na Meta"}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-muted)", cursor: busy === c.campaignId ? "default" : "pointer", flexShrink: 0, padding: 0 }}
              >
                {busy === c.campaignId ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : eff === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />}
              </button>
            )}
          </span>
          <Cell v={fmtBRL(c.spend)} bold />
          <Cell v={fmtK(c.impressions)} />
          <Cell v={fmtK(c.clicks)} />
          <Cell v={convLead(c.leads, c.clicks)} />
          <Cell v={c.leads} leads />
          <Cell v={c.cpl != null ? fmtBRL(c.cpl) : "—"} />
        </div>

        {/* Anúncios */}
        {isOpen && (
          <>
            {visibleAds.map((a) => <AdRow_ key={a.adId} a={a} connectedNumber={connectedNumber} dim={allAds && !isActiveStatus(a.status)} />)}
            {/* Inativos da campanha (só na visão principal) — expandir embutido */}
            {!allAds && inactiveAds.length > 0 && (
              <>
                <div
                  onClick={() => setShowInactiveAds((o) => ({ ...o, [c.campaignId]: !o[c.campaignId] }))}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px 8px 46px", cursor: "pointer", background: "var(--bg-elevated)", borderTop: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}
                >
                  {revealInactive ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {inactiveAds.length} pausado{inactiveAds.length > 1 ? "s" : ""}/arquivado{inactiveAds.length > 1 ? "s" : ""}
                </div>
                {revealInactive && inactiveAds.map((a) => <AdRow_ key={a.adId} a={a} connectedNumber={connectedNumber} dim />)}
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Campanhas e anúncios</p>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", alignItems: "center" }}>
          {["", "Campanha", "Status", "Investimento", "Impr.", "Cliques", "Conv.→Lead", "Leads", "CPL"].map((h, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", textAlign: i <= 2 ? "left" : "right" }}>{h}</span>
          ))}
        </div>

        {campaigns.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "16px" }}>Sem dados no período.</p>
        ) : (
          <>
            {activeCampaigns.map((c) => renderCampaign(c, false))}
            {activeCampaigns.length === 0 && (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "16px" }}>Nenhuma campanha ativa no período.</p>
            )}

            {/* Menu recolhido: campanhas só com pausados/arquivados */}
            {inactiveCampaigns.length > 0 && (
              <>
                <div
                  onClick={() => setShowInactiveCamps((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", cursor: "pointer", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em" }}
                >
                  {showInactiveCamps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Pausados e arquivados
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border)", padding: "1px 7px", borderRadius: 20 }}>
                    {inactiveCampaigns.length}
                  </span>
                </div>
                {showInactiveCamps && inactiveCampaigns.map((c) => renderCampaign(c, true))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Linha discreta de inteligência sob o nome do anúncio — só renderiza o que existe.
function AdMetaChips({ a, connectedNumber }: { a: AdRow; connectedNumber: string | null }) {
  const muted: React.CSSProperties = { fontSize: 10, color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: 6, whiteSpace: "nowrap" };
  const warn: React.CSSProperties = { ...muted, color: "#D97706", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)", fontWeight: 600 };
  const danger: React.CSSProperties = { ...muted, color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", fontWeight: 600 };
  const chips: React.ReactNode[] = [];
  const age = daysSince(a.startedAt);
  if (age != null) chips.push(<span key="age" style={muted}>há {age}d</span>);
  if (a.dailyBudget) chips.push(<span key="bud" style={muted}>{fmtBRL(a.dailyBudget)}/dia</span>);
  if (a.frequency != null && a.frequency > 0) chips.push(<span key="freq" style={a.frequency >= 2.5 ? warn : muted}>freq {a.frequency.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>);
  if (a.learningStage && LEARNING_LABEL[a.learningStage]) chips.push(<span key="learn" style={warn}>{LEARNING_LABEL[a.learningStage]}</span>);
  const below = belowRanking(a);
  if (below.length) chips.push(<span key="rel" title={`Relevância abaixo da média (Meta): ${below.join(", ")}`} style={warn}>relevância ↓</span>);
  // Destino: o sinal confiável é o destination_type do conjunto. Se não leva ao
  // WhatsApp, o lead nunca chega aqui. (nº divergente é checagem extra quando há.)
  if (a.destinationType && !isWhatsappDest(a.destinationType)) {
    chips.push(<span key="dest" title={`O clique vai para ${destLabel(a.destinationType)}, não para o WhatsApp conectado — leads não chegam aqui.`} style={danger}>não vai pro WhatsApp</span>);
  } else if (a.whatsappNumber && connectedNumber && onlyDigits(a.whatsappNumber) !== connectedNumber) {
    chips.push(<span key="dest" title={`Destino ${a.whatsappNumber} ≠ WhatsApp conectado ${connectedNumber}`} style={danger}>destino ≠ WhatsApp</span>);
  }
  if (!chips.length) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>{chips}</div>;
}

function Cell({ v, bold, leads }: { v: string | number; bold?: boolean; leads?: boolean }) {
  const positive = leads && Number(v) > 0;
  return (
    <span style={{
      fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums",
      fontWeight: positive || bold ? 700 : 400,
      color: leads ? (positive ? "#16A34A" : "var(--text-muted)") : bold ? "var(--text-primary)" : "var(--text-secondary)",
    }}>{v}</span>
  );
}

// ── Setup Form ─────────────────────────────────────────────────────────────────

function SetupForm({ clientId, initialAccountId = "", onSaved, onCancel }: {
  clientId: string;
  initialAccountId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isUpdate = !!initialAccountId;
  const [adAccountId, setAdAccountId] = useState(initialAccountId);
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adAccountId.trim() || !accessToken.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId: adAccountId.trim(), accessToken: accessToken.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erro ao conectar"); setSaving(false); return; }
    onSaved();
  }

  const inp: React.CSSProperties = {
    height: 40, width: "100%", borderRadius: 9,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)", color: "var(--text-primary)",
    padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex" }}>
          <X size={16} />
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{isUpdate ? "Atualizar token Meta Ads" : "Conectar Meta Ads"}</h2>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
            ID da conta de anúncios
          </label>
          <input
            autoFocus
            value={adAccountId}
            onChange={e => setAdAccountId(e.target.value)}
            placeholder="act_XXXXXXXXXXXXXXXXX"
            required
            style={inp}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Encontrado em Business Manager → Contas de anúncios
          </p>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
            Access Token (System User)
          </label>
          <textarea
            value={accessToken}
            onChange={e => setAccessToken(e.target.value)}
            placeholder="EAAxxxxxxxx..."
            required
            rows={3}
            style={{ ...inp, height: "auto", padding: "10px 12px", resize: "none", lineHeight: 1.5, fontFamily: "monospace", fontSize: 11 }}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Gerado em Business Manager → Usuários do sistema → Gerar token
          </p>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", fontSize: 12, color: "#DC2626", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 9, border: "none", background: "#1877F2", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />}
            {saving ? "Verificando..." : isUpdate ? "Atualizar" : "Conectar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

// Variação % vs período anterior (null quando não há base de comparação).
function growth(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function MetaKpi({ label, value, icon, bg, trend }: {
  label: string; value: string; icon: React.ReactNode; bg: string;
  trend?: { pct: number | null; goodWhenUp?: boolean };
}) {
  const pct = trend?.pct ?? null;
  const up = pct != null && pct > 0;
  // Cor: cinza quando direção não é "boa/ruim" (ex.: gasto); senão verde/vermelho.
  let color = "var(--text-muted)";
  if (pct != null && trend?.goodWhenUp !== undefined) {
    color = (up === trend.goodWhenUp) ? "#16A34A" : "#DC2626";
  }
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1, margin: 0 }}>{value}</p>
          {pct != null && Math.abs(pct) >= 1 && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color, whiteSpace: "nowrap" }}>
              {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{label}{pct != null && Math.abs(pct) >= 1 ? " · vs mês ant." : ""}</p>
      </div>
    </div>
  );
}
