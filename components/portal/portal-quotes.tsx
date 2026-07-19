"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Download, Eye, Search } from "lucide-react";

interface Quote {
  id: string;
  number: number;
  total: number;
  currency: string;
  status: string;
  summary: string | null;
  contactName: string | null;
  sentAt: string;
  createdAt: string;
}

const brl = (v: number, currency: string) => v.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  sent: { label: "Enviado", color: "#0369a1", bg: "#e0f2fe" },
  approved: { label: "Aprovado", color: "#15803d", bg: "#dcfce7" },
  rejected: { label: "Recusado", color: "#b91c1c", bg: "#fee2e2" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: "var(--p-muted)", bg: "var(--p-raise)" };
  return <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{s.label}</span>;
}

export function PortalQuotes({ token }: { token: string }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}/quotes`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) { setQuotes(d?.quotes ?? []); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const filtered = useMemo(() => {
    const list = quotes ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((x) => (x.contactName || "").toLowerCase().includes(term) || String(x.number).includes(term));
  }, [quotes, q]);

  const pdfHref = (id: string, dl?: boolean) => `/api/portal/${token}/quotes/${id}/pdf${dl ? "?dl=1" : ""}`;

  return (
    <div>
      {/* Topbar */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 14, padding: "14px 26px", borderBottom: "1px solid var(--p-border)", background: "color-mix(in srgb, var(--p-bg) 82%, transparent)", backdropFilter: "saturate(180%) blur(12px)" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "var(--p-text)" }}>Orçamentos</h1>
          <div style={{ color: "var(--p-muted)", fontSize: 12.5 }}>PDFs enviados aos leads pela IA{quotes ? ` · ${quotes.length}` : ""}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 9, padding: "6px 10px", minWidth: 200 }}>
          <Search size={14} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por lead ou nº" style={{ border: "none", background: "none", outline: "none", fontFamily: "inherit", fontSize: 13, color: "var(--p-text)", width: "100%" }} />
        </div>
      </div>

      <div className="p-wrap">
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--p-muted)", padding: 8 }}>Carregando…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 16px", color: "var(--p-muted)" }}>
            <FileText size={34} style={{ opacity: 0.5 }} />
            <p style={{ fontSize: 14, marginTop: 12, fontWeight: 600, color: "var(--p-text)" }}>{q ? "Nenhum orçamento encontrado" : "Nenhum orçamento enviado ainda"}</p>
            <p style={{ fontSize: 12.5, marginTop: 4 }}>{q ? "Tente outro termo de busca." : "Quando a IA enviar um PDF de orçamento a um lead, ele aparece aqui."}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((quote) => (
              <div key={quote.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: "var(--p-accent-soft)", color: "var(--p-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText size={18} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 14, color: "var(--p-text)" }}>Nº {quote.number}</b>
                    <StatusPill status={quote.status} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {quote.contactName || "Lead"} · {fmtDate(quote.sentAt)}
                  </div>
                </div>
                <b style={{ fontSize: 14, color: "var(--p-text)", whiteSpace: "nowrap" }}>{brl(quote.total, quote.currency)}</b>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <a href={pdfHref(quote.id)} target="_blank" rel="noopener noreferrer" title="Ver PDF" style={iconBtn}><Eye size={16} /></a>
                  <a href={pdfHref(quote.id, true)} title="Baixar PDF" style={iconBtn}><Download size={16} /></a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-muted)", textDecoration: "none" };
