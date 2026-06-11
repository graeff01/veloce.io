"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Zap, RefreshCw, Loader2, X, TrendingUp, TrendingDown,
  Eye, MousePointer, DollarSign, Users, ShoppingCart, Link2,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { WinningCampaigns } from "@/components/clients/winning-campaigns";

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

interface MetaConnection {
  id: string;
  adAccountId: string;
  accountName: string | null;
  currency: string | null;
  lastSyncAt: string | null;
  insights: MetaInsight[];
}

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

function statusColor(s: string) {
  if (s === "ACTIVE")   return { color: "#16A34A", bg: "rgba(22,163,74,0.1)",   label: "Ativo"     };
  if (s === "PAUSED")   return { color: "#D97706", bg: "rgba(217,119,6,0.1)",   label: "Pausado"   };
  if (s === "ARCHIVED") return { color: "#64748B", bg: "rgba(100,116,139,0.1)", label: "Arquivado" };
  return                       { color: "#64748B", bg: "rgba(100,116,139,0.1)", label: s           };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function AdsTab({ clientId }: { clientId: string }) {
  const [conn, setConn]         = useState<MetaConnection | null>(null);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/meta`);
    if (res.ok) {
      const data = await res.json();
      setConn(data);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    // Insights agregados (campanha/adset) + estrutura/insights por ad_id
    // (base da atribuição determinística e do CPL real do portal).
    const [res] = await Promise.all([
      fetch(`/api/clients/${clientId}/meta/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }),
      fetch(`/api/clients/${clientId}/meta/sync-ads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => null),
    ]);
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Erro ao sincronizar");
    else await load();
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
      {/* Acervo disponível mesmo sem conexão Meta */}
      {!showSetup && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
          <WinningCampaigns clientId={clientId} />
        </div>
      )}
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
  const insights = conn.insights;
  const totalSpend      = insights.reduce((s, i) => s + i.spend, 0);
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalReach      = insights.reduce((s, i) => s + i.reach, 0);
  const totalClicks     = insights.reduce((s, i) => s + i.clicks, 0);
  const totalLeads      = insights.reduce((s, i) => s + i.leads, 0);
  const avgCPL          = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCTR          = insights.length > 0 ? insights.reduce((s, i) => s + i.ctr, 0) / insights.length : 0;
  const totalPurchases  = insights.reduce((s, i) => s + i.purchases, 0);

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

        {insights.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Zap size={32} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>Nenhum dado sincronizado ainda</p>
            <button onClick={handleSync} disabled={syncing} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {syncing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />}
              Sincronizar agora
            </button>
          </div>
        ) : (
          <>
            {/* ── KPI Summary ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <MetaKpi label="Gasto total"    value={fmtBRL(totalSpend)}   icon={<DollarSign size={14} color="#DC2626" />}  bg="rgba(220,38,38,0.08)"  />
              <MetaKpi label="CPL médio"      value={totalLeads > 0 ? fmtBRL(avgCPL) : "—"} icon={<TrendingDown size={14} color="#D97706" />} bg="rgba(217,119,6,0.08)" />
              <MetaKpi label="CTR médio"      value={`${fmt(avgCTR, 2)}%`} icon={<MousePointer size={14} color="#2563EB" />} bg="rgba(37,99,235,0.08)"  />
              <MetaKpi label="Alcance"        value={fmtK(totalReach)}     icon={<Users size={14} color="#7C3AED" />}        bg="rgba(124,58,237,0.08)" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <MetaKpi label="Impressões"     value={fmtK(totalImpressions)} icon={<Eye size={14} color="#0891B2" />}       bg="rgba(8,145,178,0.08)"  />
              <MetaKpi label="Cliques"        value={fmtK(totalClicks)}    icon={<MousePointer size={14} color="#059669" />} bg="rgba(5,150,105,0.08)"  />
              <MetaKpi label="Leads"          value={String(totalLeads)}   icon={<TrendingUp size={14} color="#16A34A" />}   bg="rgba(22,163,74,0.08)"  />
              <MetaKpi label="Compras"        value={String(totalPurchases)} icon={<ShoppingCart size={14} color="#7C3AED" />} bg="rgba(124,58,237,0.08)" />
            </div>

            {/* ── Campaigns table ── */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Campanhas — {new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" })}
              </p>

              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 80px 70px 70px 80px 80px", padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  {["Campanha / Conjunto", "Status", "Gasto", "Alcance", "CTR", "CPC", "Leads", "CPL"].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</span>
                  ))}
                </div>

                {insights.map((row, i) => {
                  const st = statusColor(row.status);
                  return (
                    <div
                      key={row.id}
                      style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 80px 70px 70px 80px 80px", padding: "11px 16px", borderBottom: i < insights.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.campaignName}</p>
                        {row.adsetName && (
                          <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.adsetName}</p>
                        )}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "2px 7px", borderRadius: 20, display: "inline-block" }}>{st.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{fmtBRL(row.spend)}</span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{fmtK(row.reach)}</span>
                      <span style={{ fontSize: 12, color: row.ctr >= 2 ? "#16A34A" : row.ctr >= 1 ? "#D97706" : "var(--text-secondary)" }}>{fmt(row.ctr)}%</span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{fmtBRL(row.cpc)}</span>
                      <span style={{ fontSize: 12, fontWeight: row.leads > 0 ? 700 : 400, color: row.leads > 0 ? "#16A34A" : "var(--text-muted)" }}>{row.leads}</span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.cpl > 0 ? fmtBRL(row.cpl) : "—"}</span>
                    </div>
                  );
                })}

                {/* Footer total */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 80px 70px 70px 80px 80px", padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{insights.length} campanha{insights.length !== 1 ? "s" : ""}</span>
                  <span />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{fmtBRL(totalSpend)}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtK(totalReach)}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmt(avgCTR)}%</span>
                  <span />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>{totalLeads}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{avgCPL > 0 ? fmtBRL(avgCPL) : "—"}</span>
                </div>
              </div>
            </div>
          </>
        )}
        {/* ── Winning Campaigns ── */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <WinningCampaigns clientId={clientId} />
        </div>

      </div>
    </div>
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

function MetaKpi({ label, value, icon, bg }: { label: string; value: string; icon: React.ReactNode; bg: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1, margin: 0 }}>{value}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{label}</p>
      </div>
    </div>
  );
}
