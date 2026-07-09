"use client";

import { useEffect, useState } from "react";
import {
  Bot, Loader2, Plus, Trash2, Save, Power, BookOpen, Package,
  CalendarClock, Activity, Check, FlaskConical, Send, RotateCcw,
  DollarSign, Inbox,
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
interface IntakeField { key: string; label: string; required?: boolean; type?: "text" | "number" | "boolean" | "option"; options?: string[] }
interface Cfg {
  enabled: boolean; status: string; persona: string | null; goals: string | null; rules: string | null;
  businessHours: Window[]; fallbackMessage: string | null; model: string; audioTranscription: boolean;
  vertical: string; alwaysOn: boolean; quotesEnabled: boolean; memoryEnabled: boolean; humanize: boolean;
  visionEnabled: boolean; verifyReplies: boolean; groundingEnforce: boolean; intakeSpec: IntakeField[];
}

const VERTICALS = [
  { key: "automotivo", label: "Automotivo" },
  { key: "configuravel", label: "Produto configurável" },
  { key: "geral", label: "Geral" },
];

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
      setCfg({ enabled: d?.enabled ?? false, status: d?.status ?? "draft", persona: d?.persona ?? "", goals: d?.goals ?? "", rules: d?.rules ?? "", businessHours: d?.businessHours ?? [], fallbackMessage: d?.fallbackMessage ?? "", model: d?.model ?? "gpt-4o-mini", audioTranscription: d?.audioTranscription ?? true, vertical: d?.vertical ?? "automotivo", alwaysOn: d?.alwaysOn ?? false, quotesEnabled: d?.quotesEnabled ?? false, memoryEnabled: d?.memoryEnabled ?? false, humanize: d?.humanize ?? false, visionEnabled: d?.visionEnabled ?? false, verifyReplies: d?.verifyReplies ?? false, groundingEnforce: d?.groundingEnforce ?? false, intakeSpec: Array.isArray(d?.intakeSpec) ? d.intakeSpec : [] });
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Transcrever áudios do lead</div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Converte áudio em texto (não analisa documentos nem imagens). Recomendado.</p>
          </div>
          <button onClick={() => set({ audioTranscription: !cfg.audioTranscription })} style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: cfg.audioTranscription ? "var(--green)" : "var(--border)", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: cfg.audioTranscription ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
          </button>
        </div>
      </div>

      <div style={card}>
        <label style={label}>Segmento (vertical) — define os guardrails padrão</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          {VERTICALS.map((v) => (
            <button key={v.key} onClick={() => set({ vertical: v.key })} style={btn(cfg.vertical === v.key)}>{v.label}</button>
          ))}
        </div>

        <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Recursos avançados</div>
          <FeatureToggle on={cfg.alwaysOn} onChange={(v) => set({ alwaysOn: v })} title="Primeira linha 24/7" hint="A IA atende o dia todo, não só fora do horário." />
          <FeatureToggle on={cfg.humanize} onChange={(v) => set({ humanize: v })} title="Naturalidade" hint="Quebra a resposta em mensagens e ajusta o tom pelo sentimento do lead." />
          <FeatureToggle on={cfg.memoryEnabled} onChange={(v) => set({ memoryEnabled: v })} title="Memória de longo prazo" hint="A IA lembra de fatos do lead entre conversas." />
          <FeatureToggle on={cfg.visionEnabled} onChange={(v) => set({ visionEnabled: v })} title="Analisar imagens" hint="Lê fotos que o lead envia (espaço, referência)." />
          <FeatureToggle on={cfg.groundingEnforce} onChange={(v) => set({ groundingEnforce: v })} title="Fiscalizar preço/prazo (abster se sem fonte)" hint="Se ligado, a IA se recusa a dar preço/prazo que não veio de fonte. Deixe DESLIGADO no início: o painel mostra quando abstiria antes de você ativar." />
          <FeatureToggle on={cfg.verifyReplies} onChange={(v) => set({ verifyReplies: v })} title="Verificação extra (anti-alucinação)" hint="Confere cada resposta contra as fontes antes de enviar. Custa 1 chamada a mais." />
          <FeatureToggle on={cfg.quotesEnabled} onChange={(v) => set({ quotesEnabled: v })} title="Orçamento (coleta + preço + PDF + handoff)" hint="Habilita a IA a coletar dados, gerar orçamento e passar lead quente ao vendedor." />
        </div>

        {cfg.quotesEnabled && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <label style={label}>Ficha a coletar (a IA pergunta esses dados)</label>
            <IntakeEditor value={cfg.intakeSpec} onChange={(s) => set({ intakeSpec: s })} />
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>A <b>tabela de preços</b> é configurada na aba <b>Preços</b>.</p>
          </div>
        )}
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

// Toggle de recurso (linha com título + descrição + switch).
function FeatureToggle({ on, onChange, title, hint }: { on: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{title}</div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</p>
      </div>
      <button onClick={() => onChange(!on)} style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: on ? "var(--green)" : "var(--border)", position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
      </button>
    </div>
  );
}

// Editor da ficha configurável (lista de campos: chave, rótulo, obrigatório, tipo).
function IntakeEditor({ value, onChange }: { value: IntakeField[]; onChange: (v: IntakeField[]) => void }) {
  const upd = (i: number, p: Partial<IntakeField>) => onChange(value.map((f, idx) => (idx === i ? { ...f, ...p } : f)));
  const add = () => onChange([...value, { key: "", label: "", required: false, type: "text" }]);
  const del = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...input, flex: "1 1 110px", minWidth: 90 }} value={f.key} onChange={(e) => upd(i, { key: e.target.value.replace(/\s+/g, "_").toLowerCase() })} placeholder="chave (ex: modelo)" />
          <input style={{ ...input, flex: "1 1 140px", minWidth: 110 }} value={f.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="rótulo (ex: Modelo desejado)" />
          <select style={{ ...input, width: 110 }} value={f.type ?? "text"} onChange={(e) => upd(i, { type: e.target.value as IntakeField["type"] })}>
            <option value="text">texto</option>
            <option value="number">número</option>
            <option value="boolean">sim/não</option>
            <option value="option">opções</option>
          </select>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={!!f.required} onChange={(e) => upd(i, { required: e.target.checked })} /> obrig.
          </label>
          <button onClick={() => del(i)} style={{ ...btn(false), padding: "6px 8px" }}><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={add} style={{ ...btn(false), alignSelf: "flex-start" }}><Plus size={13} /> Adicionar campo</button>
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

// ── Console (dry-run) ─────────────────────────────────────────────────────────
interface ConsoleMsg { role: "user" | "assistant"; content: string; meta?: { decision?: string; status?: string; toolCalls?: { name: string }[] } }

function ConsoleSection({ clientId }: { clientId: string }) {
  const [msgs, setMsgs] = useState<ConsoleMsg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const t = text.trim();
    if (!t || loading) return;
    const next: ConsoleMsg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setText(""); setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/ai/console`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const d = await res.json();
      setMsgs([...next, d.reply
        ? { role: "assistant", content: d.reply, meta: { decision: d.decision, status: d.status, toolCalls: d.toolCalls } }
        : { role: "assistant", content: d.error || "(sem resposta)", meta: { status: "error" } }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Erro de rede.", meta: { status: "error" } }]);
    }
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, background: "var(--accent-soft)", borderColor: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
          <b>Mesmo motor da produção</b> (prompt, tools, guardrails, RAG e decisão) em <b>modo teste</b>: não envia WhatsApp, não cria visita, não altera dados. Conversa efêmera. <i>Salve a configuração antes de testar.</i>
        </p>
        {msgs.length > 0 && <button onClick={() => setMsgs([])} style={{ ...btn(), flexShrink: 0 }}><RotateCcw size={13} /> Limpar</button>}
      </div>

      <div style={{ ...card, minHeight: 280, maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "auto" }}>Mande uma mensagem como se fosse o lead.</p>}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <div style={{ padding: "8px 12px", borderRadius: 12, fontSize: 13, whiteSpace: "pre-wrap", background: m.role === "user" ? "var(--accent)" : "var(--bg-base)", color: m.role === "user" ? "#fff" : "var(--text-primary)", border: m.role === "user" ? "none" : "1px solid var(--border)" }}>
              {m.content}
            </div>
            {m.meta && (m.meta.decision || m.meta.toolCalls?.length) && (
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {m.meta.decision && <span style={{ padding: "1px 6px", borderRadius: 999, background: m.meta.status === "blocked" ? "var(--red)" : "var(--accent-soft)", color: m.meta.status === "blocked" ? "#fff" : "var(--accent)" }}>{m.meta.decision}</span>}
                {m.meta.toolCalls?.map((tc, j) => <span key={j} style={{ opacity: 0.8 }}>🔧 {tc.name}</span>)}
              </div>
            )}
          </div>
        ))}
        {loading && <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--text-muted)" }}><Loader2 size={14} className="animate-spin" /></div>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Ex: oi, vi o anúncio do Taos, ainda tem?" />
        <button onClick={send} disabled={loading} style={btn(true)}><Send size={14} /> Enviar</button>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
// ── Preços (F2) ───────────────────────────────────────────────────────────────
interface PriceItem { key: string; label: string; amount: number }
interface Fee { key: string; label: string; amount?: number; percent?: number }
interface Rules { base: PriceItem[]; options: PriceItem[]; fees: Fee[] }

function PricingSection({ clientId }: { clientId: string }) {
  const [currency, setCurrency] = useState("BRL");
  const [rules, setRules] = useState<Rules>({ base: [], options: [], fees: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/pricing`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrency(d?.currency ?? "BRL");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRules({ base: d?.rules?.base ?? [], options: d?.rules?.options ?? [], fees: d?.rules?.fees ?? [] });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    });
  }, [clientId]);

  async function save() {
    setSaving(true);
    await fetch(`/api/clients/${clientId}/ai/pricing`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency, rules }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  const setItems = (group: "base" | "options", items: PriceItem[]) => setRules({ ...rules, [group]: items });
  const updItem = (group: "base" | "options", i: number, p: Partial<PriceItem>) => setItems(group, rules[group].map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const addItem = (group: "base" | "options") => setItems(group, [...rules[group], { key: "", label: "", amount: 0 }]);
  const delItem = (group: "base" | "options", i: number) => setItems(group, rules[group].filter((_, idx) => idx !== i));

  const ItemEditor = (group: "base" | "options", titulo: string) => (
    <div style={card}>
      <label style={label}>{titulo}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rules[group].map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...input, flex: "1 1 100px", minWidth: 80 }} value={it.key} onChange={(e) => updItem(group, i, { key: e.target.value.replace(/\s+/g, "_").toLowerCase() })} placeholder="chave" />
            <input style={{ ...input, flex: "1 1 150px", minWidth: 110 }} value={it.label} onChange={(e) => updItem(group, i, { label: e.target.value })} placeholder="rótulo" />
            <input style={{ ...input, width: 120 }} type="number" value={it.amount} onChange={(e) => updItem(group, i, { amount: Number(e.target.value) })} placeholder="valor (R$)" />
            <button onClick={() => delItem(group, i)} style={{ ...btn(false), padding: "6px 8px" }}><Trash2 size={13} /></button>
          </div>
        ))}
        <button onClick={() => addItem(group)} style={{ ...btn(false), alignSelf: "flex-start" }}><Plus size={13} /> Adicionar</button>
      </div>
    </div>
  );

  const updFee = (i: number, p: Partial<Fee>) => setRules({ ...rules, fees: rules.fees.map((f, idx) => (idx === i ? { ...f, ...p } : f)) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Tabela de preços da IA. Ela só usa <b>estas chaves</b> — o valor nunca é inventado. Base é o que o cliente escolhe; opcionais somam; taxas podem ser valor fixo ou % do subtotal.</p>
      {ItemEditor("base", "Itens base (o cliente escolhe um)")}
      {ItemEditor("options", "Opcionais (somam ao preço)")}
      <div style={card}>
        <label style={label}>Taxas (frete, instalação — valor fixo OU %)</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rules.fees.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input style={{ ...input, flex: "1 1 100px", minWidth: 80 }} value={f.key} onChange={(e) => updFee(i, { key: e.target.value.replace(/\s+/g, "_").toLowerCase() })} placeholder="chave" />
              <input style={{ ...input, flex: "1 1 130px", minWidth: 100 }} value={f.label} onChange={(e) => updFee(i, { label: e.target.value })} placeholder="rótulo" />
              <input style={{ ...input, width: 100 }} type="number" value={f.amount ?? ""} onChange={(e) => updFee(i, { amount: e.target.value === "" ? undefined : Number(e.target.value), percent: undefined })} placeholder="R$ fixo" />
              <input style={{ ...input, width: 80 }} type="number" value={f.percent ?? ""} onChange={(e) => updFee(i, { percent: e.target.value === "" ? undefined : Number(e.target.value), amount: undefined })} placeholder="%" />
              <button onClick={() => setRules({ ...rules, fees: rules.fees.filter((_, idx) => idx !== i) })} style={{ ...btn(false), padding: "6px 8px" }}><Trash2 size={13} /></button>
            </div>
          ))}
          <button onClick={() => setRules({ ...rules, fees: [...rules.fees, { key: "", label: "" }] })} style={{ ...btn(false), alignSelf: "flex-start" }}><Plus size={13} /> Adicionar taxa</button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={save} disabled={saving} style={btn(true)}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />} {saved ? "Salvo" : "Salvar tabela"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Moeda</span>
          <input style={{ ...input, width: 70 }} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
      </div>
    </div>
  );
}

// ── Handoffs (F2) ─────────────────────────────────────────────────────────────
interface HandoffRow {
  id: string; reason: string; status: string; quoteId: string | null; createdAt: string;
  briefing: { motivo?: string; ficha?: Record<string, unknown> | null; orcamento?: { numero: number; total: number; currency: string } | null; resumo?: string[] };
  contact: { name: string | null; displayName: string | null; waId: string } | null;
}

function HandoffSection({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<HandoffRow[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch(`/api/clients/${clientId}/ai/handoffs`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows(Array.isArray(d) ? d : []); setLoading(false);
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  async function setStatus(handoffId: string, status: string) {
    await fetch(`/api/clients/${clientId}/ai/handoffs`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoffId, status }) });
    load();
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  const pill = (s: string) => {
    const map: Record<string, [string, string]> = { pending: ["#B45309", "rgba(245,158,11,0.12)"], claimed: ["#2563EB", "rgba(37,99,235,0.12)"], done: ["#16A34A", "rgba(22,163,74,0.12)"] };
    const [fg, bg] = map[s] ?? ["#6B7280", "rgba(107,114,128,0.12)"];
    return <span style={{ fontSize: 11, fontWeight: 700, color: fg, background: bg, padding: "2px 8px", borderRadius: 20 }}>{s === "pending" ? "novo" : s === "claimed" ? "em atendimento" : "concluído"}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Leads <b>quentes</b> que a IA passou para o vendedor — com a ficha, o orçamento e o resumo da conversa.</p>
      {rows.length === 0 && <div style={{ ...card, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhum handoff ainda.</div>}
      {rows.map((h) => (
        <div key={h.id} style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              {h.contact?.displayName ?? h.contact?.name ?? "Lead"} {h.contact?.waId ? <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>· {h.contact.waId}</span> : null}
            </div>
            {pill(h.status)}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}><b>Motivo:</b> {h.briefing?.motivo ?? h.reason}</div>
          {h.briefing?.orcamento && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}><b>Orçamento:</b> Nº {h.briefing.orcamento.numero} — {h.briefing.orcamento.total.toLocaleString("pt-BR", { style: "currency", currency: h.briefing.orcamento.currency || "BRL" })}</div>
          )}
          {h.briefing?.ficha && Object.keys(h.briefing.ficha).length > 0 && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}><b>Ficha:</b> {Object.entries(h.briefing.ficha).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
          )}
          {h.briefing?.resumo && h.briefing.resumo.length > 0 && (
            <details style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              <summary style={{ cursor: "pointer" }}>Ver resumo da conversa</summary>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>{h.briefing.resumo.map((l, i) => <span key={i}>{l}</span>)}</div>
            </details>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {h.status !== "claimed" && <button onClick={() => setStatus(h.id, "claimed")} style={btn(false)}>Assumir</button>}
            {h.status !== "done" && <button onClick={() => setStatus(h.id, "done")} style={btn(true)}><Check size={13} /> Concluir</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

type Section = "config" | "precos" | "handoffs" | "console" | "catalogo" | "conhecimento" | "agendamento" | "atividade";

export function AiAgentTab({ clientId }: { clientId: string }) {
  const [section, setSection] = useState<Section>("config");
  const sections: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "config", label: "Configuração", icon: <Bot size={13} /> },
    { key: "console", label: "Console", icon: <FlaskConical size={13} /> },
    { key: "precos", label: "Preços", icon: <DollarSign size={13} /> },
    { key: "handoffs", label: "Handoffs", icon: <Inbox size={13} /> },
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
      {section === "precos" && <PricingSection clientId={clientId} />}
      {section === "handoffs" && <HandoffSection clientId={clientId} />}
      {section === "console" && <ConsoleSection clientId={clientId} />}
      {section === "catalogo" && <CatalogSection clientId={clientId} />}
      {section === "conhecimento" && <KnowledgeSection clientId={clientId} />}
      {section === "agendamento" && <SchedulingSection clientId={clientId} />}
      {section === "atividade" && <ActivitySection clientId={clientId} />}
    </div>
  );
}
