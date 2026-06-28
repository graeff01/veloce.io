"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Link2, Unplug, AlertCircle, Eye, X, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { GoogleGlyph } from "@/components/clients/brand-glyphs";
import { computeWaste, accountHealth } from "@/lib/google-ads/audit";

const GBLUE = "#4285F4";

interface GoogleState {
  connected: boolean;
  configured: boolean;
  oauthDone?: boolean;
  customerId?: string;
  loginCustomerId?: string | null;
  accountName?: string | null;
  currency?: string | null;
  lastSyncAt?: string | null;
  totals?: { spend: number; impressions: number; clicks: number; conversions: number };
  deltas?: { spend: number | null; conversions: number | null; clicks: number | null; impressions: number | null } | null;
  impressionShare?: { share: number | null; lostBudget: number | null; lostRank: number | null } | null;
  campaigns?: { campaignId: string; name: string; status: string; spend: number; impressions: number; clicks: number; conversions: number; impressionShare?: number | null; lostBudget?: number | null; lostRank?: number | null }[];
  searchTerms?: { term: string; spend: number; clicks: number; conversions: number }[];
  keywords?: { keyword: string; matchType: string; qualityScore: number | null; spend: number; clicks: number; conversions: number }[];
  series?: { date: string; spend: number; conversions: number }[];
  changeEvents?: { changedAt: string; userEmail: string | null; resourceType: string | null; operation: string | null; summary: string | null }[];
  diagnostics?: { kind: string; severity: string; title: string; detail: string | null }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`);

// Dados de exemplo (revenda de veículos) — só pra pré-visualizar o layout populado.
const DEMO: GoogleState = {
  connected: true, configured: true, oauthDone: true,
  customerId: "123-456-7890", accountName: "Conta de exemplo",
  lastSyncAt: new Date().toISOString(),
  totals: { spend: 4820.5, impressions: 184300, clicks: 5120, conversions: 96 },
  deltas: { spend: 9, conversions: 23, clicks: 15, impressions: 8 },
  impressionShare: { share: 0.62, lostBudget: 0.28, lostRank: 0.1 },
  campaigns: [
    { campaignId: "1", name: "Pesquisa · Seminovos", status: "ENABLED", spend: 2110.3, impressions: 88200, clicks: 2630, conversions: 51, impressionShare: 0.58, lostBudget: 0.32, lostRank: 0.1 },
    { campaignId: "2", name: "Pesquisa · Compass", status: "ENABLED", spend: 1340, impressions: 52100, clicks: 1490, conversions: 28, impressionShare: 0.66, lostBudget: 0.22, lostRank: 0.12 },
    { campaignId: "3", name: "PMax · Estoque", status: "ENABLED", spend: 980.2, impressions: 38900, clicks: 870, conversions: 14, impressionShare: 0.7, lostBudget: 0.2, lostRank: 0.1 },
    { campaignId: "4", name: "Pesquisa · Financiamento", status: "PAUSED", spend: 390, impressions: 5100, clicks: 130, conversions: 3, impressionShare: 0.4, lostBudget: 0.5, lostRank: 0.1 },
  ],
  searchTerms: [
    { term: "compass 2024 preço", spend: 320.4, clicks: 210, conversions: 9 },
    { term: "seminovos perto de mim", spend: 280.1, clicks: 180, conversions: 8 },
    { term: "tiguan usado", spend: 240, clicks: 150, conversions: 6 },
    { term: "carro automático financiamento", spend: 210.5, clicks: 140, conversions: 4 },
    { term: "onix 2022", spend: 160.2, clicks: 110, conversions: 3 },
    { term: "revisão de carro", spend: 130, clicks: 90, conversions: 0 },
    { term: "concessionária boqueirão", spend: 95.4, clicks: 70, conversions: 2 },
    { term: "vender meu carro", spend: 88, clicks: 60, conversions: 0 },
  ],
  keywords: [
    { keyword: "seminovos", matchType: "BROAD", qualityScore: 8, spend: 510, clicks: 320, conversions: 14 },
    { keyword: "comprar compass", matchType: "PHRASE", qualityScore: 9, spend: 420.3, clicks: 250, conversions: 12 },
    { keyword: "tiguan", matchType: "EXACT", qualityScore: 7, spend: 360, clicks: 210, conversions: 8 },
    { keyword: "carros usados", matchType: "BROAD", qualityScore: 6, spend: 300.1, clicks: 190, conversions: 5 },
    { keyword: "financiamento de carro", matchType: "PHRASE", qualityScore: 5, spend: 180, clicks: 120, conversions: 2 },
  ],
  series: (() => {
    const vals = [2, 3, 1, 4, 3, 5, 2, 3, 4, 2, 1, 3, 5, 4, 3, 2, 4, 6, 3, 2, 1, 3, 4, 5, 2, 3, 4, 2, 3, 5];
    const base = new Date();
    return vals.map((v, i) => { const d = new Date(base); d.setDate(base.getDate() - (vals.length - 1 - i)); return { date: d.toISOString().slice(0, 10), spend: 0, conversions: v }; });
  })(),
  diagnostics: [
    { kind: "conversion_tracking", severity: "ok", title: "Rastreamento de conversão ativo", detail: "1 ação de conversão (Lead) registrando." },
    { kind: "budget_limited", severity: "warn", title: "2 campanhas limitadas por orçamento", detail: "Seminovos e Compass perdem impressões por verba." },
    { kind: "disapproved_ad", severity: "error", title: "1 anúncio reprovado", detail: "Campanha PMax · Estoque — política de imagem." },
    { kind: "recommendation", severity: "info", title: "3 recomendações do Google", detail: "Palavras-chave e lances sugeridos." },
  ],
  changeEvents: (() => {
    const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
    return [
      { changedAt: h(5), userEmail: "veloce@agencia.com", resourceType: "CAMPAIGN_BUDGET", operation: "UPDATE", summary: "Orçamento da campanha Seminovos: R$50 → R$60/dia" },
      { changedAt: h(26), userEmail: "veloce@agencia.com", resourceType: "AD_GROUP_CRITERION", operation: "REMOVE", summary: 'Palavra-chave pausada: "revisão de carro"' },
      { changedAt: h(50), userEmail: "veloce@agencia.com", resourceType: "AD_GROUP_AD", operation: "CREATE", summary: "Novo anúncio responsivo na campanha Compass" },
      { changedAt: h(74), userEmail: "veloce@agencia.com", resourceType: "CAMPAIGN", operation: "UPDATE", summary: "Estratégia de lance → Maximizar conversões" },
    ];
  })(),
};

export function GoogleAdsTab({ clientId }: { clientId: string }) {
  const [state, setState] = useState<GoogleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState("");
  // form de conexão
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [demo, setDemo] = useState(false);
  const [section, setSection] = useState<"overview" | "buscas" | "auditoria">("overview");

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/google`);
    if (res.ok) setState(await res.json());
    setLoading(false);
  }, [clientId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [clientId]);

  async function connect() {
    setSaving(true); setErr("");
    const res = await fetch(`/api/clients/${clientId}/google`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, loginCustomerId, accountName }),
    });
    setSaving(false);
    if (!res.ok) { setErr("Não foi possível conectar."); return; }
    load();
  }

  async function disconnect() {
    if (!confirm("Desconectar a conta Google deste cliente?")) return;
    await fetch(`/api/clients/${clientId}/google`, { method: "DELETE" });
    load();
  }

  async function sync() {
    setSyncing(true); setErr("");
    const res = await fetch(`/api/clients/${clientId}/google/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setSyncing(false);
    if (!res.ok) { const d = await res.json().catch(() => null); setErr(d?.error ?? "Falha ao sincronizar."); return; }
    load();
  }

  if (loading) return <div style={{ padding: 32 }}><div style={{ height: 80, borderRadius: 12, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} /></div>;

  // ── Não conectado: tela de conexão ──
  if (!demo && !state?.connected) {
    return (
      <div style={{ padding: "24px 28px" }}>
        <div style={{ maxWidth: 520, border: "1px solid var(--border)", borderRadius: 14, background: "var(--bg-surface)", padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <GoogleGlyph size={22} /><h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Google Ads</h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 18 }}>
            Conecte a conta de anúncios do Google pra acompanhar campanhas, custo, conversões e termos de busca — tudo pelo nosso sistema, sem entrar no Google Ads.
          </p>
          {!state?.configured && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--amber-soft)", color: "var(--amber)", padding: "10px 12px", borderRadius: 9, fontSize: 12.5, marginBottom: 16 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Motor pronto, mas as credenciais (developer token + OAuth) ainda não estão configuradas no servidor. Você já pode salvar o ID da conta; o sync ativa quando as chaves entrarem.</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="ID da conta Google Ads *" value={customerId} onChange={setCustomerId} placeholder="123-456-7890" />
            <Inp label="ID da conta MCC (se houver)" value={loginCustomerId} onChange={setLoginCustomerId} placeholder="opcional" />
            <Inp label="Nome da conta" value={accountName} onChange={setAccountName} placeholder="Ex: Boqueirão Veículos" />
            <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              <button onClick={connect} disabled={saving || !customerId.trim()} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 18px", borderRadius: 9, border: "none", background: GBLUE, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving || !customerId.trim() ? "not-allowed" : "pointer", opacity: saving || !customerId.trim() ? 0.6 : 1 }}>
                {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={14} />} Conectar conta Google
              </button>
              <button onClick={() => setDemo(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Eye size={14} /> Ver demonstração
              </button>
            </div>
            {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ── Conectado (ou demonstração) ──
  const view = demo ? DEMO : state!;
  const t = view.totals ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
  const waste = computeWaste(view.searchTerms ?? []);
  const wasteRatio = t.spend > 0 ? waste.amount / t.spend : 0;
  const health = accountHealth({ impressionShare: view.impressionShare?.share ?? null, wasteRatio, diagnostics: view.diagnostics ?? [] });
  const hasData = (view.campaigns?.length ?? 0) > 0;
  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
      {demo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(66,133,244,.10)", border: "1px solid rgba(66,133,244,.35)", color: GBLUE, padding: "10px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}>
          <Eye size={15} /> Demonstração · dados de exemplo (não é uma conta real). É assim que a aba fica depois de conectar e sincronizar.
          <button onClick={() => setDemo(false)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: GBLUE, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><X size={14} /> Sair</button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <GoogleGlyph size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{view.accountName || "Conta Google"}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            ID {view.customerId}{view.lastSyncAt ? ` · sincronizado ${new Date(view.lastSyncAt).toLocaleDateString("pt-BR")}` : " · ainda não sincronizado"}
          </div>
        </div>
        {!demo && (
          <>
            <a href={`/api/clients/${clientId}/google/report`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}>
              <FileText size={13} /> Relatório (PDF)
            </a>
            <button onClick={sync} disabled={syncing} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "none", background: GBLUE, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {syncing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />} Sincronizar agora
            </button>
            <button onClick={disconnect} title="Desconectar" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-muted)", fontSize: 12.5, cursor: "pointer" }}>
              <Unplug size={13} /> Desconectar
            </button>
          </>
        )}
      </div>

      {(!view.configured || !view.oauthDone) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--amber-soft)", color: "var(--amber)", padding: "10px 12px", borderRadius: 9, fontSize: 12.5 }}>
          <AlertCircle size={15} /> Aguardando credenciais (developer token / OAuth). Os números aparecem após o primeiro sync, quando as chaves estiverem ativas.
        </div>
      )}

      {err && <div style={{ fontSize: 12.5, color: "var(--red)", background: "var(--red-soft)", padding: "8px 12px", borderRadius: 8 }}>{err}</div>}

      {/* Nota de saúde da conta — auditoria de relance (sempre visível) */}
      {hasData && <HealthCard {...health} />}

      {/* Sub-navegação — uma seção por vez, pra não poluir */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        {([["overview", "Visão geral"], ["buscas", "Buscas"], ["auditoria", "Auditoria"]] as const).map(([k, label]) => {
          const on = section === k;
          return (
            <button key={k} onClick={() => setSection(k)} style={{ padding: "8px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: on ? 600 : 500, color: on ? GBLUE : "var(--text-muted)", borderBottom: on ? `2px solid ${GBLUE}` : "2px solid transparent", marginBottom: -1 }}>{label}</button>
          );
        })}
      </div>

      {section === "overview" && (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Kpi label="Investimento" value={brl(t.spend)} delta={view.deltas?.spend} />
          <Kpi label="Conversões" value={num(t.conversions)} delta={view.deltas?.conversions} goodWhenUp />
          <Kpi label="Impressões" value={num(t.impressions)} delta={view.deltas?.impressions} goodWhenUp />
          <Kpi label="Cliques" value={num(t.clicks)} delta={view.deltas?.clicks} goodWhenUp />
        </div>

        {waste.count > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: "1px solid rgba(220,38,38,.3)", background: "var(--red-soft)", borderRadius: 12, padding: "13px 16px" }}>
            <span style={{ fontSize: 22 }}>💸</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Desperdício: {brl(waste.amount)} sem conversão</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{waste.count} busca(s) gastaram e não geraram nada · {Math.round(wasteRatio * 100)}% do investimento</div>
            </div>
            <button onClick={() => setSection("buscas")} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(220,38,38,.4)", background: "transparent", color: "var(--red)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Ver buscas →</button>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, alignItems: "start" }}>
          <ImpressionShare is={view.impressionShare} />
          <TrendSpark series={view.series ?? []} />
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg-surface)", boxShadow: "var(--shadow-card)" }}>
          <div style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>Campanhas</div>
          {(view.campaigns?.length ?? 0) === 0 ? (
            <Empty>Nenhuma campanha sincronizada ainda.</Empty>
          ) : (
            view.campaigns!.map((c) => (
              <div key={c.campaignId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{num(c.conversions)} conv.</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{brl(c.spend)}</span>
              </div>
            ))
          )}
        </div>
      </>)}

      {section === "buscas" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
          <Panel title="🔎 Termos de busca · o que as pessoas digitaram">
            {(view.searchTerms?.length ?? 0) === 0 ? (
              <Empty>Os termos aparecem após o primeiro sync.</Empty>
            ) : (
              view.searchTerms!.slice(0, 20).map((s) => (
                <Row key={s.term} a={s.term} b={`${num(s.conversions)} conv.`} c={brl(s.spend)} highlight={s.conversions === 0 && s.spend > 0} />
              ))
            )}
          </Panel>
          <Panel title="🗝️ Palavras-chave">
            {(view.keywords?.length ?? 0) === 0 ? (
              <Empty>As palavras-chave aparecem após o primeiro sync.</Empty>
            ) : (
              view.keywords!.slice(0, 20).map((k) => (
                <Row key={`${k.keyword}-${k.matchType}`} a={k.keyword} b={k.qualityScore != null ? `QS ${k.qualityScore}` : `${num(k.conversions)} conv.`} c={brl(k.spend)} />
              ))
            )}
          </Panel>
        </div>
      )}

      {section === "auditoria" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
          <Panel title="🩺 Diagnóstico da conta">
            {(view.diagnostics?.length ?? 0) === 0 ? (
              <Empty>O diagnóstico aparece após o primeiro sync.</Empty>
            ) : (
              view.diagnostics!.map((d, i) => <Diag key={i} d={d} />)
            )}
          </Panel>
          <Panel title="🕘 Histórico de mudanças · auditoria">
            {(view.changeEvents?.length ?? 0) === 0 ? (
              <Empty>O histórico aparece após o primeiro sync.</Empty>
            ) : (
              view.changeEvents!.slice(0, 20).map((c, i) => <Change key={i} c={c} />)
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, delta, goodWhenUp }: { label: string; value: string; delta?: number | null; goodWhenUp?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-surface)", boxShadow: "var(--shadow-card)", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginTop: 6 }}>{value}</div>
      {delta != null && <DeltaBadge pct={delta} goodWhenUp={goodWhenUp} />}
    </div>
  );
}

function DeltaBadge({ pct, goodWhenUp }: { pct: number; goodWhenUp?: boolean }) {
  const up = pct >= 0;
  const neutral = goodWhenUp === undefined;
  const color = neutral ? "var(--text-muted)" : up === goodWhenUp ? "#16A34A" : "#DC2626";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600, color, marginTop: 5 }}>
      <Icon size={12} /> {up ? "+" : ""}{pct}% <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>vs. anterior</span>
    </span>
  );
}

function HealthCard({ score, label, color, factors }: { score: number; label: string; color: string; factors: { label: string; delta: number }[] }) {
  const C = 2 * Math.PI * 28;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-surface)", boxShadow: "var(--shadow-card)", padding: 16, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ position: "relative", width: 64, height: 64 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bg-elevated)" strokeWidth="7" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform="rotate(-90 32 32)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{score}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)" }}>Saúde da conta</div>
          <div style={{ fontSize: 18, fontWeight: 800, color }}>{label}</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 220, borderLeft: "1px solid var(--border)", paddingLeft: 18 }}>
        {factors.length === 0 ? (
          <div style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>✓ Nenhum problema detectado — conta saudável.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)", marginBottom: 1 }}>Por que essa nota</div>
            {factors.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                <span style={{ color: "var(--text-secondary)" }}>{f.label}</span>
                <span style={{ color: "#DC2626", fontWeight: 700, flexShrink: 0 }}>{f.delta}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Inp({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.05 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ height: 38, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13, outline: "none" }} />
    </label>
  );
}

const cap: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)" };

function ImpressionShare({ is }: { is?: { share: number | null; lostBudget: number | null; lostRank: number | null } | null }) {
  const share = is?.share ?? null, lostB = is?.lostBudget ?? 0, lostR = is?.lostRank ?? 0;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-surface)", padding: 16 }}>
      <div style={cap}>Parcela de impressões</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>{pct(share)}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>da demanda que você captura</div>
      <div style={{ display: "flex", height: 8, borderRadius: 5, overflow: "hidden", background: "var(--bg-elevated)" }}>
        <span style={{ width: `${(share ?? 0) * 100}%`, background: GBLUE }} />
        <span style={{ width: `${lostB * 100}%`, background: "#F59E0B" }} />
        <span style={{ width: `${lostR * 100}%`, background: "#EF4444" }} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11.5, color: "var(--text-muted)", flexWrap: "wrap" }}>
        <Legend c={GBLUE} t={`Captura ${pct(share)}`} />
        <Legend c="#F59E0B" t={`Perde ${pct(is?.lostBudget)} · orçamento`} />
        <Legend c="#EF4444" t={`Perde ${pct(is?.lostRank)} · ranking`} />
      </div>
    </div>
  );
}

function TrendSpark({ series }: { series: { date: string; spend: number; conversions: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.conversions));
  const total = series.reduce((s, x) => s + x.conversions, 0);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-surface)", padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={cap}>Conversões por dia</span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{num(total)} no período</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, flex: 1, minHeight: 48, marginTop: 10 }}>
        {series.length === 0
          ? <span style={{ fontSize: 12, color: "var(--text-muted)", margin: "auto" }}>Sem dados ainda</span>
          : series.map((s, i) => (
            <div key={i} title={`${s.date}: ${num(s.conversions)} conv.`} style={{ flex: 1, minWidth: 2, height: `${Math.max(4, (s.conversions / max) * 100)}%`, background: s.conversions ? GBLUE : "var(--border)", borderRadius: 3 }} />
          ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg-surface)", boxShadow: "var(--shadow-card)" }}>
      <div style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>{children}</div>;
}

function Row({ a, b, c, highlight }: { a: string; b: string; c: string; highlight?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--border)", background: highlight ? "var(--red-soft)" : undefined }}>
      <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{b}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: highlight ? "var(--red)" : "var(--text-primary)" }}>{c}</span>
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{t}</span>;
}

function Diag({ d }: { d: { kind: string; severity: string; title: string; detail: string | null } }) {
  const sev: Record<string, { c: string; i: string }> = {
    ok: { c: "#16A34A", i: "✓" }, info: { c: GBLUE, i: "i" }, warn: { c: "#D97706", i: "!" }, error: { c: "#DC2626", i: "✕" },
  };
  const s = sev[d.severity] ?? sev.info;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, background: s.c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, marginTop: 1 }}>{s.i}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{d.title}</div>
        {d.detail && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{d.detail}</div>}
      </div>
    </div>
  );
}

function Change({ c }: { c: { changedAt: string; userEmail: string | null; resourceType: string | null; operation: string | null; summary: string | null } }) {
  const op: Record<string, string> = { CREATE: "#16A34A", UPDATE: "#D97706", REMOVE: "#DC2626" };
  const dot = c.operation ? op[c.operation] : undefined;
  const when = new Date(c.changedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 6, background: dot ?? "var(--text-muted)" }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{c.summary ?? `Alteração em ${c.resourceType ?? "recurso"}`}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{c.userEmail ?? "—"} · {when}</div>
      </div>
    </div>
  );
}
