"use client";

import { useEffect, useState } from "react";
import {
  Bot, Loader2, Plus, Trash2, Save, Power, BookOpen, Package,
  CalendarClock, Activity, Check,
} from "lucide-react";

// ── Tokens & helpers ──────────────────────────────────────────────────────────
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit" };
const btn = (primary?: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: primary ? "var(--accent)" : "var(--bg-surface)", color: primary ? "#fff" : "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" });

interface Window { weekday: number; start: string; end: string }

function WindowsEditor({ value, onChange }: { value: Window[]; onChange: (w: Window[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhuma janela. Adicione abaixo.</p>}
      {value.map((w, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={w.weekday} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, weekday: Number(e.target.value) } : x))} style={{ ...input, width: 90 }}>
            {WEEKDAYS.map((d, k) => <option key={k} value={k}>{d}</option>)}
          </select>
          <input type="time" value={w.start} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} style={{ ...input, width: 120 }} />
          <span style={{ color: "var(--text-muted)" }}>até</span>
          <input type="time" value={w.end} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} style={{ ...input, width: 120 }} />
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ ...btn(), padding: 8, color: "var(--red)" }}><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...value, { weekday: 1, start: "09:00", end: "18:00" }])} style={{ ...btn(), alignSelf: "flex-start" }}><Plus size={13} /> Adicionar janela</button>
    </div>
  );
}

// ── Config ────────────────────────────────────────────────────────────────────
interface Cfg { enabled: boolean; status: string; persona: string | null; goals: string | null; rules: string | null; businessHours: Window[]; fallbackMessage: string | null; model: string }

const STATUS_OPTS: { key: string; label: string; hint: string }[] = [
  { key: "draft", label: "Rascunho", hint: "configurando — não atende" },
  { key: "test", label: "Teste", hint: "validação — não envia no WhatsApp real" },
  { key: "live", label: "Produção", hint: "atende leads de verdade (fora do horário)" },
];

function ConfigSection({ clientId }: { clientId: string }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/config`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCfg({ enabled: d?.enabled ?? false, status: d?.status ?? "draft", persona: d?.persona ?? "", goals: d?.goals ?? "", rules: d?.rules ?? "", businessHours: d?.businessHours ?? [], fallbackMessage: d?.fallbackMessage ?? "", model: d?.model ?? "gpt-4o-mini" });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    });
  }, [clientId]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    await fetch(`/api/clients/${clientId}/ai/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  if (loading || !cfg) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
            <Power size={15} color={cfg.enabled ? "var(--green)" : "var(--text-muted)"} /> Agente {cfg.enabled ? "ligado" : "desligado"}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Quando ligado, a IA responde leads <b>fora do horário comercial</b> definido abaixo.</p>
        </div>
        <button onClick={() => set({ enabled: !cfg.enabled })} style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: cfg.enabled ? "var(--green)" : "var(--border)", position: "relative", transition: "background .15s" }}>
          <span style={{ position: "absolute", top: 3, left: cfg.enabled ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
        </button>
      </div>

      <div style={card}>
        <label style={label}>Estágio do agente</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_OPTS.map((s) => (
            <button key={s.key} onClick={() => set({ status: s.key })} style={{ ...btn(cfg.status === s.key), flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 12px", borderColor: cfg.status === s.key ? "var(--accent)" : "var(--border)" }}>
              <span>{s.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.85 }}>{s.hint}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Só <b>Produção</b> envia mensagens reais. Use <b>Teste</b> para validar antes de ativar com leads.</p>
      </div>

      <div style={card}>
        <label style={label}>Horário comercial — a IA atua FORA disto (no fuso do cliente)</label>
        <WindowsEditor value={cfg.businessHours} onChange={(w) => set({ businessHours: w })} />
      </div>

      <div style={card}>
        <label style={label}>Tom de voz / personalidade</label>
        <input style={input} value={cfg.persona ?? ""} onChange={(e) => set({ persona: e.target.value })} placeholder="Ex: cordial, objetivo, simpático, sem gírias" />
        <label style={{ ...label, marginTop: 14 }}>Objetivo do atendimento</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={cfg.goals ?? ""} onChange={(e) => set({ goals: e.target.value })} placeholder="Ex: entender a necessidade, tirar dúvidas e agendar visita à loja" />
        <label style={{ ...label, marginTop: 14 }}>Regras específicas do cliente</label>
        <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={cfg.rules ?? ""} onChange={(e) => set({ rules: e.target.value })} placeholder="Ex: sempre oferecer visita; horário da loja; nunca falar de concorrentes..." />
        <label style={{ ...label, marginTop: 14 }}>Mensagem de fallback (quando escala / não pode responder)</label>
        <input style={input} value={cfg.fallbackMessage ?? ""} onChange={(e) => set({ fallbackMessage: e.target.value })} placeholder="Ex: Vou pedir para um vendedor te dar os detalhes, tá? 😊" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={save} disabled={saving} style={btn(true)}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />} {saved ? "Salvo" : "Salvar configuração"}
        </button>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Motor: {cfg.model}</span>
      </div>
    </div>
  );
}

// ── Catálogo ──────────────────────────────────────────────────────────────────
interface Item { id: string; title: string; price: number | null; available: boolean }

function CatalogSection({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");

  function load() {
    fetch(`/api/clients/${clientId}/catalog`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(Array.isArray(d) ? d : []); setLoading(false);
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  async function add() {
    if (!title.trim()) return;
    await fetch(`/api/clients/${clientId}/catalog`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), price: price ? Number(price) : null }) });
    setTitle(""); setPrice(""); load();
  }
  async function toggle(it: Item) { await fetch(`/api/clients/${clientId}/catalog/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available: !it.available }) }); load(); }
  async function del(id: string) { await fetch(`/api/clients/${clientId}/catalog/${id}`, { method: "DELETE" }); load(); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>O catálogo é a <b>única fonte</b> de produto/preço da IA. Sem item aqui, ela não inventa — encaminha para um vendedor.</p>
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}><label style={label}>Produto</label><input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: VW Taos Highline 2022" /></div>
        <div style={{ width: 140 }}><label style={label}>Preço (R$)</label><input style={input} type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="129900" /></div>
        <button onClick={add} style={btn(true)}><Plus size={14} /> Adicionar</button>
      </div>
      {loading ? <div style={{ padding: 30, textAlign: "center" }}><Loader2 size={18} className="animate-spin" /></div> : (
        <div style={{ ...card, padding: 0 }}>
          {items.length === 0 && <p style={{ padding: 20, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Catálogo vazio.</p>}
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{it.title}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{it.price ? `R$ ${it.price.toLocaleString("pt-BR")}` : "—"}</span>
              <button onClick={() => toggle(it)} style={{ ...btn(), padding: "4px 10px", fontSize: 11, color: it.available ? "var(--green)" : "var(--text-muted)" }}>{it.available ? "Disponível" : "Indisponível"}</button>
              <button onClick={() => del(it.id)} style={{ ...btn(), padding: 7, color: "var(--red)" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Conhecimento ──────────────────────────────────────────────────────────────
interface Chunk { id: string; title: string | null; content: string }

function KnowledgeSection({ clientId }: { clientId: string }) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/clients/${clientId}/ai/knowledge`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChunks(Array.isArray(d) ? d : []); setLoading(false);
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  async function add() {
    if (!content.trim()) return;
    setSaving(true);
    await fetch(`/api/clients/${clientId}/ai/knowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() || undefined, content: content.trim() }) });
    setTitle(""); setContent(""); setSaving(false); load();
  }
  async function del(id: string) { await fetch(`/api/clients/${clientId}/ai/knowledge?chunkId=${id}`, { method: "DELETE" }); load(); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Políticas e FAQ que a IA pode usar como fonte (horário, garantias, como funciona a visita...). Fora disto, ela não responde — escala.</p>
      <div style={card}>
        <label style={label}>Título (opcional)</label>
        <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Horário de funcionamento" />
        <label style={{ ...label, marginTop: 12 }}>Conteúdo</label>
        <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ex: A loja fica na Av. X, abre de seg a sáb das 8h30 às 18h30. A visita não tem custo..." />
        <button onClick={add} disabled={saving} style={{ ...btn(true), marginTop: 12 }}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar</button>
      </div>
      {loading ? <div style={{ padding: 30, textAlign: "center" }}><Loader2 size={18} className="animate-spin" /></div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {chunks.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhum conhecimento cadastrado.</p>}
          {chunks.map((c) => (
            <div key={c.id} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                {c.title && <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{c.title}</div>}
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{c.content}</div>
              </div>
              <button onClick={() => del(c.id)} style={{ ...btn(), padding: 7, color: "var(--red)" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Agendamento ───────────────────────────────────────────────────────────────
function SchedulingSection({ clientId }: { clientId: string }) {
  const [cfg, setCfg] = useState<{ slotMinutes: number; capacityPerSlot: number; windows: Window[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/visits/config`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCfg({ slotMinutes: d?.slotMinutes ?? 60, capacityPerSlot: d?.capacityPerSlot ?? 1, windows: d?.windows ?? [] });
    });
  }, [clientId]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    await fetch(`/api/clients/${clientId}/visits/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  if (!cfg) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>A IA só agenda visitas dentro destas janelas e respeitando a capacidade. Nunca inventa horário.</p>
      <div style={card}>
        <label style={label}>Janelas em que a loja recebe visita</label>
        <WindowsEditor value={cfg.windows} onChange={(w) => setCfg({ ...cfg, windows: w })} />
      </div>
      <div style={{ ...card, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ width: 180 }}><label style={label}>Duração de cada visita (min)</label><input style={input} type="number" value={cfg.slotMinutes} onChange={(e) => setCfg({ ...cfg, slotMinutes: Number(e.target.value) })} /></div>
        <div style={{ width: 180 }}><label style={label}>Visitas simultâneas por horário</label><input style={input} type="number" value={cfg.capacityPerSlot} onChange={(e) => setCfg({ ...cfg, capacityPerSlot: Number(e.target.value) })} /></div>
      </div>
      <button onClick={save} disabled={saving} style={{ ...btn(true), alignSelf: "flex-start" }}>{saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />} {saved ? "Salvo" : "Salvar"}</button>
    </div>
  );
}

// ── Atividade (observabilidade) ───────────────────────────────────────────────
interface Interaction { id: string; inbound: string | null; outbound: string | null; decision: string | null; status: string; latencyMs: number; createdAt: string }
interface Metrics { total: number; avgLatencyMs: number; tokensIn: number; tokensOut: number; byDecision: Record<string, number> }

function ActivitySection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<{ items: Interaction[]; metrics: Metrics } | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/interactions`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(d);
    });
  }, [clientId]);

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;
  const m = data.metrics;
  const cost = ((m.tokensIn / 1_000_000) * 0.15 + (m.tokensOut / 1_000_000) * 0.6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {[
          { l: "Turnos", v: m.total },
          { l: "Latência média", v: `${m.avgLatencyMs} ms` },
          { l: "Tokens", v: (m.tokensIn + m.tokensOut).toLocaleString("pt-BR") },
          { l: "Custo estimado", v: `US$ ${cost.toFixed(4)}` },
        ].map((k) => (
          <div key={k.l} style={card}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{k.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {Object.keys(m.byDecision).length > 0 && (
        <div style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(m.byDecision).map(([k, v]) => (
            <span key={k} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }}>{k}: {v}</span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.items.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhuma interação ainda. Quando a IA responder um lead, aparece aqui.</p>}
        {data.items.map((it) => (
          <div key={it.id} style={{ ...card, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: it.status === "blocked" ? "var(--red)" : "var(--accent-soft)", color: it.status === "blocked" ? "#fff" : "var(--accent)" }}>{it.decision ?? it.status}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(it.createdAt).toLocaleString("pt-BR")} · {it.latencyMs}ms</span>
            </div>
            {it.inbound && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}><b>Lead:</b> {it.inbound}</div>}
            {it.outbound && <div style={{ fontSize: 12.5, color: "var(--text-primary)", marginTop: 2 }}><b>IA:</b> {it.outbound}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
type Section = "config" | "catalogo" | "conhecimento" | "agendamento" | "atividade";

export function AiAgentTab({ clientId }: { clientId: string }) {
  const [section, setSection] = useState<Section>("config");
  const sections: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "config", label: "Configuração", icon: <Bot size={13} /> },
    { key: "catalogo", label: "Estoque", icon: <Package size={13} /> },
    { key: "conhecimento", label: "Conhecimento", icon: <BookOpen size={13} /> },
    { key: "agendamento", label: "Agendamento", icon: <CalendarClock size={13} /> },
    { key: "atividade", label: "Atividade", icon: <Activity size={13} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
        {sections.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: section === s.key ? "var(--accent-soft)" : "transparent", color: section === s.key ? "var(--accent)" : "var(--text-muted)" }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>
      {section === "config" && <ConfigSection clientId={clientId} />}
      {section === "catalogo" && <CatalogSection clientId={clientId} />}
      {section === "conhecimento" && <KnowledgeSection clientId={clientId} />}
      {section === "agendamento" && <SchedulingSection clientId={clientId} />}
      {section === "atividade" && <ActivitySection clientId={clientId} />}
    </div>
  );
}
