"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, Users, Megaphone, Phone, FileDown, RefreshCw } from "lucide-react";
import { WaConversation, type WaConversationContact } from "@/components/clients/wa-conversation";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface ConnClient { clientId: string; name: string; displayPhone: string | null; lastEventAt: string | null; leadCount: number }
interface AuditLead { id: string; contactId: string; name: string | null; phone: string | null; enteredAt: string }
interface AuditGroup { adTitle: string; total: number; leads: AuditLead[] }
interface AuditData { client: { id: string; name: string }; displayPhone: string | null; totalLeads: number; groups: AuditGroup[] }

export function AuditContent() {
  const now = new Date();
  const [clients, setClients] = useState<ConnClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<WaConversationContact | null>(null);

  useEffect(() => {
    fetch("/api/audit")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ConnClient[]) => {
        setClients(list);
        if (list.length && !clientId) setClientId(list[0].clientId);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    const res = await fetch(`/api/audit?clientId=${clientId}&year=${year}&month=${month}`);
    if (res.ok) setData(await res.json());
  }, [clientId, year, month]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  function handleReport() {
    if (!clientId) return;
    window.open(`/api/audit/report?clientId=${clientId}&year=${year}&month=${month}`, "_blank");
  }

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );

  if (clients.length === 0) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 48, textAlign: "center" }}>
      <ClipboardCheck size={40} style={{ color: "var(--text-muted)", opacity: 0.25 }} />
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Auditoria de Leads</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 400, lineHeight: 1.6 }}>
        Nenhum cliente com WhatsApp conectado ainda. Abra um cliente → aba <strong>WhatsApp</strong> → conecte a Cloud API para começar.
      </p>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(124,58,237,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ClipboardCheck size={18} color="var(--accent)" />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Auditoria de Leads</h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Leads por anúncio, direto do WhatsApp</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={select}>
            {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={select}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={select}>
            {[0, 1, 2].map((d) => { const y = now.getFullYear() - d; return <option key={y} value={y}>{y}</option>; })}
          </select>
          <div style={{ flex: 1 }} />
          <button onClick={loadData} style={btn}><RefreshCw size={12} /> Atualizar</button>
          <button onClick={handleReport} style={{ ...btn, background: "var(--accent)", color: "#fff", border: "none" }}><FileDown size={13} /> Gerar Relatório</button>
        </div>
      </div>

      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Kpi icon={<Users size={15} color="var(--accent)" />} label="Total de leads" value={String(data?.totalLeads ?? 0)} />
          <Kpi icon={<Megaphone size={15} color="#2563EB" />} label="Anúncios ativos" value={String(data?.groups.length ?? 0)} />
        </div>

        {!data || data.groups.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Megaphone size={32} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Nenhum lead de anúncio em {MONTHS[month - 1]} de {year}.</p>
          </div>
        ) : data.groups.map((g) => (
          <div key={g.adTitle} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--bg-elevated)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Megaphone size={14} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.adTitle}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "rgba(124,58,237,0.1)", padding: "2px 10px", borderRadius: 20 }}>{g.total} lead{g.total !== 1 ? "s" : ""}</span>
            </div>
            {g.leads.map((l, i) => (
              <div key={l.id} onClick={() => setOpen({ contactId: l.contactId, name: l.name, phone: l.phone, adTitle: g.adTitle })} title="Ver conversa"
                style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 90px", padding: "10px 16px", borderBottom: i < g.leads.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", cursor: "pointer" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name ?? "—"}</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>{l.phone ? <><Phone size={11} /> +{l.phone}</> : "—"}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(l.enteredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {open && <WaConversation clientId={data!.client.id} contact={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, minWidth: 180 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div>
        <p style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1, margin: 0 }}>{value}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{label}</p>
      </div>
    </div>
  );
}

const select: React.CSSProperties = { height: 34, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer" };
const btn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" };
