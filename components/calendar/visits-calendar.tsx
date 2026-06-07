"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Car, Phone, Trash2, Bot } from "lucide-react";

type View = "dia" | "semana" | "mes";

interface Visit {
  id: string; leadName: string; leadPhone: string | null; car: string | null;
  scheduledAt: string; durationMin: number; status: string; source: string; notes: string | null;
}

const STATUS: Record<string, { label: string; color: string; soft: string }> = {
  agendada:   { label: "Agendada",   color: "#2563EB", soft: "rgba(37,99,235,0.14)" },
  confirmada: { label: "Confirmada", color: "#7C3AED", soft: "rgba(124,58,237,0.14)" },
  compareceu: { label: "Compareceu", color: "#16A34A", soft: "rgba(22,163,74,0.14)" },
  faltou:     { label: "Faltou",     color: "#DC2626", soft: "rgba(220,38,38,0.14)" },
  cancelada:  { label: "Cancelada",  color: "#64748B", soft: "rgba(100,116,139,0.14)" },
};
const HOURS = Array.from({ length: 15 }, (_, i) => 7 + i); // 07h–21h
const HOUR_H = 46;
const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfWeek = (d: Date) => { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(d.getDate() + n); return x; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function VisitsCalendar({ clientId }: { clientId: string }) {
  const [view, setView] = useState<View>("semana");
  const [cursor, setCursor] = useState(() => new Date());
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ visit?: Visit; date?: Date } | null>(null);

  const { start, end } = useMemo(() => {
    if (view === "mes") {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const gridStart = startOfWeek(first);
      return { start: gridStart, end: addDays(gridStart, 42) };
    }
    if (view === "semana") { const s = startOfWeek(cursor); return { start: s, end: addDays(s, 7) }; }
    const s = new Date(cursor); s.setHours(0, 0, 0, 0); return { start: s, end: addDays(s, 1) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/clients/${clientId}/visits?from=${start.toISOString()}&to=${end.toISOString()}`);
    if (r.ok) setVisits(await r.json());
    setLoading(false);
  }, [clientId, start, end]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function move(dir: number) {
    if (view === "mes") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else setCursor(addDays(cursor, dir * (view === "semana" ? 7 : 1)));
  }

  const label = view === "mes"
    ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : view === "semana"
      ? `${start.getDate()}–${addDays(start, 6).getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`
      : cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-base)" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setCursor(new Date())} style={btn}>Hoje</button>
          <div style={{ display: "flex" }}>
            <button onClick={() => move(-1)} style={{ ...iconBtn, borderRadius: "8px 0 0 8px" }}><ChevronLeft size={16} /></button>
            <button onClick={() => move(1)} style={{ ...iconBtn, borderRadius: "0 8px 8px 0", borderLeft: "none" }}><ChevronRight size={16} /></button>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", textTransform: "capitalize" }}>{label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {(["dia", "semana", "mes"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "6px 13px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, textTransform: "capitalize",
                background: view === v ? "var(--accent)" : "var(--bg-surface)", color: view === v ? "#fff" : "var(--text-secondary)",
              }}>{v === "mes" ? "Mês" : v}</button>
            ))}
          </div>
          <button onClick={() => setModal({ date: new Date() })} style={{ ...btn, background: "var(--accent)", color: "#fff", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Nova visita
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {loading && <div style={{ position: "absolute", top: 10, right: 16, zIndex: 5 }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>}
        {view === "mes"
          ? <MonthGrid start={start} cursor={cursor} visits={visits} onNew={(d) => setModal({ date: d })} onOpen={(v) => setModal({ visit: v })} />
          : <TimeGrid days={view === "semana" ? Array.from({ length: 7 }, (_, i) => addDays(start, i)) : [start]} visits={visits} onNew={(d) => setModal({ date: d })} onOpen={(v) => setModal({ visit: v })} />}
      </div>

      {modal && <VisitModal clientId={clientId} visit={modal.visit} date={modal.date} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

/* ─── Grade por hora (semana/dia) ──────────────────────── */
function TimeGrid({ days, visits, onNew, onOpen }: { days: Date[]; visits: Visit[]; onNew: (d: Date) => void; onOpen: (v: Visit) => void }) {
  const now = new Date();
  return (
    <div style={{ display: "flex", minWidth: days.length > 1 ? 760 : "auto" }}>
      {/* Gutter de horas */}
      <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
        <div style={{ height: 40, borderBottom: "1px solid var(--border)" }} />
        {HOURS.map((h) => (
          <div key={h} style={{ height: HOUR_H, position: "relative" }}>
            <span style={{ position: "absolute", top: -7, right: 8, fontSize: 10.5, color: "var(--text-muted)" }}>{String(h).padStart(2, "0")}:00</span>
          </div>
        ))}
      </div>
      {/* Colunas dos dias */}
      {days.map((day) => {
        const isToday = sameDay(day, now);
        const dayVisits = visits.filter((v) => sameDay(new Date(v.scheduledAt), day));
        return (
          <div key={day.toISOString()} style={{ flex: 1, borderRight: "1px solid var(--border)", minWidth: 0 }}>
            <div style={{ height: 40, borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, background: isToday ? "var(--accent-soft)" : "transparent" }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>{WEEKDAYS[day.getDay()]}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: isToday ? "var(--accent)" : "var(--text-primary)" }}>{day.getDate()}</span>
            </div>
            <div style={{ position: "relative", height: HOURS.length * HOUR_H }}>
              {HOURS.map((h, i) => (
                <div key={h} onClick={() => { const d = new Date(day); d.setHours(h, 0, 0, 0); onNew(d); }}
                  style={{ height: HOUR_H, borderBottom: i < HOURS.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} />
              ))}
              {/* Linha do agora */}
              {isToday && now.getHours() >= 7 && now.getHours() <= 21 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: (now.getHours() - 7) * HOUR_H + (now.getMinutes() / 60) * HOUR_H, height: 2, background: "var(--red)", zIndex: 3 }} />
              )}
              {dayVisits.map((v) => {
                const d = new Date(v.scheduledAt);
                const top = Math.max(0, (d.getHours() - 7) * HOUR_H + (d.getMinutes() / 60) * HOUR_H);
                const h = Math.max(22, (v.durationMin / 60) * HOUR_H);
                const st = STATUS[v.status] ?? STATUS.agendada;
                return (
                  <div key={v.id} onClick={(e) => { e.stopPropagation(); onOpen(v); }}
                    style={{ position: "absolute", top, left: 3, right: 3, height: h, background: st.soft, borderLeft: `3px solid ${st.color}`, borderRadius: 6, padding: "3px 7px", overflow: "hidden", cursor: "pointer", zIndex: 2 }}>
                    <p style={{ fontSize: 11.5, fontWeight: 700, color: st.color, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                      {v.source === "ia" && <Bot size={10} />}{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {v.leadName}
                    </p>
                    {v.car && <p style={{ fontSize: 10.5, color: "var(--text-secondary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.car}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Grade do mês ─────────────────────────────────────── */
function MonthGrid({ start, cursor, visits, onNew, onOpen }: { start: Date; cursor: Date; visits: Visit[]; onNew: (d: Date) => void; onOpen: (v: Visit) => void }) {
  const now = new Date();
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 520 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ textAlign: "center", padding: "8px 0", fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>{w}</div>)}
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: "repeat(6, 1fr)" }}>
        {days.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, now);
          const dayVisits = visits.filter((v) => sameDay(new Date(v.scheduledAt), day));
          return (
            <div key={ymd(day)} onClick={() => { const d = new Date(day); d.setHours(9, 0, 0, 0); onNew(d); }}
              style={{ borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: 5, minHeight: 84, background: inMonth ? "var(--bg-surface)" : "var(--bg-base)", cursor: "pointer", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 11.5, fontWeight: isToday ? 700 : 500, color: isToday ? "#fff" : inMonth ? "var(--text-secondary)" : "var(--text-muted)", background: isToday ? "var(--accent)" : "transparent", width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{day.getDate()}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                {dayVisits.slice(0, 3).map((v) => {
                  const st = STATUS[v.status] ?? STATUS.agendada;
                  return (
                    <div key={v.id} onClick={(e) => { e.stopPropagation(); onOpen(v); }}
                      style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.soft, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {new Date(v.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {v.leadName}
                    </div>
                  );
                })}
                {dayVisits.length > 3 && <span style={{ fontSize: 9.5, color: "var(--text-muted)", paddingLeft: 4 }}>+{dayVisits.length - 3} mais</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Modal de visita ──────────────────────────────────── */
function VisitModal({ clientId, visit, date, onClose, onSaved }: { clientId: string; visit?: Visit; date?: Date; onClose: () => void; onSaved: () => void }) {
  const base = visit ? new Date(visit.scheduledAt) : (date ?? new Date());
  const [f, setF] = useState({
    leadName: visit?.leadName ?? "",
    leadPhone: visit?.leadPhone ?? "",
    car: visit?.car ?? "",
    day: ymd(base),
    time: `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`,
    durationMin: visit?.durationMin ?? 30,
    status: visit?.status ?? "agendada",
    notes: visit?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.leadName.trim()) return;
    setSaving(true); setError("");
    const scheduledAt = new Date(`${f.day}T${f.time}:00`).toISOString();
    const body = { leadName: f.leadName.trim(), leadPhone: f.leadPhone.trim() || undefined, car: f.car.trim() || undefined, scheduledAt, durationMin: f.durationMin, status: f.status, notes: f.notes.trim() || undefined };
    const url = visit ? `/api/clients/${clientId}/visits/${visit.id}` : `/api/clients/${clientId}/visits`;
    const r = await fetch(url, { method: visit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? "Erro ao salvar"); return; }
    onSaved();
  }

  async function remove() {
    if (!visit || !confirm("Excluir esta visita?")) return;
    await fetch(`/api/clients/${clientId}/visits/${visit.id}`, { method: "DELETE" });
    onSaved();
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(8px)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", background: "var(--bg-surface)", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{visit ? "Visita" : "Nova visita"}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={16} /></button>
        </div>
        <form onSubmit={save} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Lead"><input autoFocus value={f.leadName} onChange={set("leadName")} placeholder="Nome do cliente" required style={inp} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Telefone"><div style={{ position: "relative" }}><Phone size={13} style={{ position: "absolute", left: 10, top: 13, color: "var(--text-muted)" }} /><input value={f.leadPhone} onChange={set("leadPhone")} placeholder="+55..." style={{ ...inp, paddingLeft: 30 }} /></div></Field>
            <Field label="Carro"><div style={{ position: "relative" }}><Car size={13} style={{ position: "absolute", left: 10, top: 13, color: "var(--text-muted)" }} /><input value={f.car} onChange={set("car")} placeholder="Ex: Taos HL" style={{ ...inp, paddingLeft: 30 }} /></div></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 12 }}>
            <Field label="Data"><input type="date" value={f.day} onChange={set("day")} required style={inp} /></Field>
            <Field label="Hora"><input type="time" value={f.time} onChange={set("time")} required style={inp} /></Field>
            <Field label="Duração"><select value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} style={inp}>{[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
          </div>
          <Field label="Status"><select value={f.status} onChange={set("status")} style={inp}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field label="Notas"><textarea value={f.notes} onChange={set("notes")} placeholder="Observações da visita..." rows={2} style={{ ...inp, height: "auto", padding: "9px 12px", resize: "vertical" }} /></Field>

          {error && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
            {visit
              ? <button type="button" onClick={remove} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "var(--red)", fontSize: 12.5, cursor: "pointer" }}><Trash2 size={13} /> Excluir</button>
              : <span />}
            <button type="submit" disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />} Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>{label}</label>{children}</div>);
}

const btn: React.CSSProperties = { padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const iconBtn: React.CSSProperties = { width: 32, height: 32, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const inp: React.CSSProperties = { height: 38, width: "100%", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" };
