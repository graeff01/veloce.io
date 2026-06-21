"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, Lock, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Overview {
  responded: number;
  converted: number;
  avgFirstResponseSec: number | null;
  funnel: { recebido: number; respondido: number; qualificado: number; negociacao: number; perdido: number; convertido: number };
}

interface FunnelLead { contactId: string; name: string | null; waId: string; lastMessageAt: string | null; origin: string | null; manual: boolean }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, boxShadow: "var(--shadow-card)" };

const LEAD_STAGES: { key: string; label: string; color: string }[] = [
  { key: "negociacao", label: "Em negociação", color: "#7C3AED" },
  { key: "convertido", label: "Convertidos", color: "#16A34A" },
  { key: "qualificado", label: "Qualificados", color: "#2563EB" },
  { key: "perdido", label: "Perdidos", color: "#94A3B8" },
];

const STAGE_OPTS: { value: string; label: string }[] = [
  { value: "", label: "— Sem etapa (volta ao automático) —" },
  { value: "qualificado", label: "Qualificado" },
  { value: "negociacao", label: "Em negociação" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
];

function fmtPhone(waId: string): string {
  const d = (waId || "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) {
    const ddd = d.slice(2, 4); const rest = d.slice(4);
    const p = rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `(${ddd}) ${p}`;
  }
  return d ? `+${d}` : "—";
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function LeadSection({ label, color, items, open, onToggle, onSelect }: { label: string; color: string; items: FunnelLead[]; open: boolean; onToggle: () => void; onSelect: (l: FunnelLead) => void }) {
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <button onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", flex: 1, textAlign: "left" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: items.length ? color : "var(--text-muted)", background: items.length ? `${color}1A` : "transparent", padding: "1px 8px", borderRadius: 20, minWidth: 22, textAlign: "center" }}>{items.length}</span>
        <ChevronDown size={15} style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {items.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 16px" }}>Nenhum lead nesta etapa no período.</p>
          ) : items.map((l) => (
            <button key={l.contactId} onClick={() => onSelect(l)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: "1px solid var(--border)", background: "transparent", border: "none", borderTopColor: "var(--border)", cursor: "pointer", textAlign: "left" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name || "Sem nome"}</span>
                  {l.manual && <Lock size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                  {fmtPhone(l.waId)}{l.origin ? ` · ${l.origin}` : ""}{l.lastMessageAt ? ` · ${fmtWhen(l.lastMessageAt)}` : ""}
                </div>
              </div>
              <MessageCircle size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}min`;
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone ?? "var(--text-primary)", marginTop: 6, letterSpacing: "-0.02em" }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function FunnelBar({ label, count, base, prevCount, color }: { label: string; count: number; base: number; prevCount: number | null; color: string }) {
  const wOfBase = base > 0 ? Math.max(3, Math.round((count / base) * 100)) : 0;
  const ofBase = base > 0 ? Math.round((count / base) * 100) : 0;
  const advance = prevCount != null && prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{label}</span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          {count.toLocaleString("pt-BR")}
          {base > 0 ? ` · ${ofBase}% do total` : ""}
          {advance != null ? ` · ${advance}% da etapa anterior` : ""}
        </span>
      </div>
      <div style={{ height: 26, borderRadius: 7, background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{ width: `${wOfBase}%`, height: "100%", background: color, borderRadius: 7, display: "flex", alignItems: "center", paddingLeft: 10, transition: "width 450ms ease-out" }}>
          {wOfBase > 16 ? <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{count.toLocaleString("pt-BR")}</span> : null}
        </div>
      </div>
    </div>
  );
}

interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string }

function LeadHistoryModal({ clientId, lead, stage, onClose, onChanged }: { clientId: string; lead: FunnelLead; stage: string; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Msg[] | null>(null);
  const [stg, setStg] = useState(stage);
  const [savingStg, setSavingStg] = useState(false);
  useEffect(() => {
    fetch(`/api/clients/${clientId}/whatsapp/conversations/${lead.contactId}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setItems([]));
  }, [clientId, lead.contactId]);

  async function saveStage(v: string) {
    setStg(v); setSavingStg(true);
    await fetch(`/api/clients/${clientId}/whatsapp/conversations/${lead.contactId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funnelStage: v || null }),
    }).catch(() => {});
    setSavingStg(false);
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={lead.name || fmtPhone(lead.waId)} size="md">
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
        {fmtPhone(lead.waId)}{lead.origin ? ` · ${lead.origin}` : ""}
      </div>

      {/* Corrigir a etapa na hora (trava o automático) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>Etapa:</span>
        <select value={stg} onChange={(e) => saveStage(e.target.value)} disabled={savingStg}
          style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13 }}>
          {STAGE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {savingStg && <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
      </div>
      {items === null ? (
        <div style={{ padding: 30, textAlign: "center" }}><Loader2 size={18} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Sem mensagens.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {items.map((m) => {
            const out = m.direction === "out";
            return (
              <div key={m.id} style={{ alignSelf: out ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 2, textAlign: out ? "right" : "left" }}>{out ? "Loja" : "Lead"} · {new Date(m.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                <div style={{ padding: "8px 11px", borderRadius: 12, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.4, background: out ? "var(--accent)" : "var(--bg-elevated)", color: out ? "#fff" : "var(--text-primary)", border: out ? "none" : "1px solid var(--border)" }}>
                  {m.text || (m.type !== "text" ? `(${m.type})` : "")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function FunnelTab({ clientId }: { clientId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "noconn">("loading");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [leads, setLeads] = useState<Record<string, FunnelLead[]>>({});
  const [openStages, setOpenStages] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ lead: FunnelLead; stage: string } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const res = await fetch(`/api/clients/${clientId}/whatsapp/funnel?year=${year}&month=${month}`);
    if (res.status === 404) { setState("noconn"); return; }
    if (res.ok) {
      const d = await res.json();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(d); setLeads(d.stages ?? {}); setState("ok");
    }
  }, [clientId, month, year]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  async function runBackfill() {
    if (backfilling) return;
    setBackfilling(true); setBackfillMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/whatsapp/funnel-backfill`, { method: "POST" });
      const d = await res.json();
      setBackfillMsg(res.ok ? `${d.updated} conversa(s) classificada(s) de ${d.scanned}.` : (d.error ?? "Erro ao recalcular."));
      if (res.ok) load();
    } catch {
      setBackfillMsg("Erro de rede.");
    }
    setBackfilling(false);
  }

  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ flex: 1, padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header / período */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={prevMonth} style={navBtn}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", minWidth: 130 }}>{MONTHS[month - 1]} {year}</span>
        <button onClick={nextMonth} style={navBtn}><ChevronRight size={15} /></button>
        <div style={{ flex: 1 }} />
        {backfillMsg && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{backfillMsg}</span>}
        <button onClick={runBackfill} disabled={backfilling} title="Classifica o funil das conversas já existentes pelo histórico"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: backfilling ? "default" : "pointer", opacity: backfilling ? 0.6 : 1 }}>
          {backfilling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Recalcular histórico
        </button>
      </div>

      {state === "loading" && <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>}

      {state === "noconn" && (
        <div style={{ ...card, textAlign: "center", padding: "40px 18px" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>WhatsApp não conectado. O funil é alimentado pelas conversas do WhatsApp.</p>
        </div>
      )}

      {state === "ok" && data && (() => {
        const f = data.funnel;
        // Funil cumulativo (etapas "alcançou"): estritamente decrescente.
        const recebidos = f.recebido;
        const qualificados = f.qualificado + f.negociacao + f.convertido;
        const emNegociacao = f.negociacao + f.convertido;
        const convertidos = f.convertido;
        const respRate = recebidos > 0 ? Math.round((data.responded / recebidos) * 100) : 0;
        const convRate = recebidos > 0 ? Math.round((convertidos / recebidos) * 100) : 0;

        // Listas CUMULATIVAS (quem alcançou a etapa) — batem com as barras. Um lead
        // em negociação também consta em qualificados. Perdido é à parte (terminal).
        const recent = (a: FunnelLead, b: FunnelLead) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
        const q = leads.qualificado ?? [], n = leads.negociacao ?? [], c = leads.convertido ?? [];
        const cumLeads: Record<string, FunnelLead[]> = {
          qualificado: [...q, ...n, ...c].sort(recent),
          negociacao: [...n, ...c].sort(recent),
          convertido: [...c].sort(recent),
          perdido: (leads.perdido ?? []).slice().sort(recent),
        };
        return (
          <>
            {/* KPIs principais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Kpi label="Leads de anúncio" value={recebidos.toLocaleString("pt-BR")} hint="da Meta · no mês" />
              <Kpi label="Taxa de resposta" value={`${respRate}%`} tone={respRate >= 80 ? "var(--green)" : respRate >= 50 ? "var(--amber)" : "var(--red)"} hint="leads atendidos" />
              <Kpi label="Em negociação" value={emNegociacao.toLocaleString("pt-BR")} hint="chegaram a negociar" />
              <Kpi label="Convertidos" value={convertidos.toLocaleString("pt-BR")} tone={convertidos > 0 ? "var(--green)" : undefined} />
              <Kpi label="Taxa de conversão" value={`${convRate}%`} tone={convRate > 0 ? "var(--green)" : undefined} hint="lead → venda" />
              <Kpi label="Tempo de resposta" value={fmtDur(data.avgFirstResponseSec)} hint="média até o 1º contato" />
            </div>

            {/* Funil visual */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Funil de conversão</div>
              {recebidos === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum lead no período.</p>
              ) : (
                <>
                  <FunnelBar label="Recebidos" count={recebidos} base={recebidos} prevCount={null} color="#475569" />
                  <FunnelBar label="Qualificados" count={qualificados} base={recebidos} prevCount={recebidos} color="#2563EB" />
                  <FunnelBar label="Em negociação" count={emNegociacao} base={recebidos} prevCount={qualificados} color="#7C3AED" />
                  <FunnelBar label="Convertidos" count={convertidos} base={recebidos} prevCount={emNegociacao} color="#16A34A" />
                  {f.perdido > 0 && (
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>
                      {f.perdido.toLocaleString("pt-BR")} {f.perdido === 1 ? "lead perdido" : "leads perdidos"} no período (desinteresse ou inatividade).
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Leads por etapa (cumulativo: quem alcançou a etapa) — bate com as barras */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Leads por etapa</div>
              {LEAD_STAGES.map((st) => (
                <LeadSection
                  key={st.key}
                  label={st.label}
                  color={st.color}
                  items={cumLeads[st.key] ?? []}
                  open={!!openStages[st.key]}
                  onToggle={() => setOpenStages((o) => ({ ...o, [st.key]: !o[st.key] }))}
                  onSelect={(l) => setSelected({ lead: l, stage: st.key })}
                />
              ))}
            </div>

            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
              O funil considera <b>apenas leads de anúncio (Meta)</b>, e é <b>cumulativo</b>: cada etapa mostra quem a <b>alcançou</b> (um lead em negociação também consta em qualificados). As etapas são preenchidas automaticamente pela conversa (sem custo de IA). Toque num lead para ver o histórico de mensagens. O cadeado indica etapa ajustada manualmente — aí o automático respeita.
            </p>
          </>
        );
      })()}

      {selected && <LeadHistoryModal clientId={clientId} lead={selected.lead} stage={selected.stage} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}
