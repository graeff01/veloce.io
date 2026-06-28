"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Link2, Unplug, AlertCircle } from "lucide-react";
import { GoogleGlyph } from "@/components/clients/brand-glyphs";

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
  campaigns?: { campaignId: string; name: string; status: string; spend: number; impressions: number; clicks: number; conversions: number }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR");

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
  if (!state?.connected) {
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
            <button onClick={connect} disabled={saving || !customerId.trim()} style={{ marginTop: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 18px", borderRadius: 9, border: "none", background: GBLUE, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving || !customerId.trim() ? "not-allowed" : "pointer", opacity: saving || !customerId.trim() ? 0.6 : 1 }}>
              {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={14} />} Conectar conta Google
            </button>
            {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ── Conectado ──
  const t = state.totals ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <GoogleGlyph size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{state.accountName || "Conta Google"}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            ID {state.customerId}{state.lastSyncAt ? ` · sincronizado ${new Date(state.lastSyncAt).toLocaleDateString("pt-BR")}` : " · ainda não sincronizado"}
          </div>
        </div>
        <button onClick={sync} disabled={syncing} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "none", background: GBLUE, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {syncing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />} Sincronizar agora
        </button>
        <button onClick={disconnect} title="Desconectar" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-muted)", fontSize: 12.5, cursor: "pointer" }}>
          <Unplug size={13} /> Desconectar
        </button>
      </div>

      {(!state.configured || !state.oauthDone) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--amber-soft)", color: "var(--amber)", padding: "10px 12px", borderRadius: 9, fontSize: 12.5 }}>
          <AlertCircle size={15} /> Aguardando credenciais (developer token / OAuth). Os números aparecem após o primeiro sync, quando as chaves estiverem ativas.
        </div>
      )}

      {err && <div style={{ fontSize: 12.5, color: "var(--red)", background: "var(--red-soft)", padding: "8px 12px", borderRadius: 8 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Kpi label="Investimento" value={brl(t.spend)} />
        <Kpi label="Conversões" value={num(t.conversions)} />
        <Kpi label="Impressões" value={num(t.impressions)} />
        <Kpi label="Cliques" value={num(t.clicks)} />
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>Campanhas</div>
        {(state.campaigns?.length ?? 0) === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>Nenhuma campanha sincronizada ainda.</div>
        ) : (
          state.campaigns!.map((c) => (
            <div key={c.campaignId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{num(c.conversions)} conv.</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{brl(c.spend)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-surface)", padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginTop: 6 }}>{value}</div>
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
