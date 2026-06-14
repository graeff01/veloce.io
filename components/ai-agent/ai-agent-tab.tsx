"use client";

import { useEffect, useState } from "react";
import {
  Bot, Loader2, Plus, Trash2, Save, Power, BookOpen, Package,
  Activity, Check, FlaskConical, Send, RotateCcw,
  Pause, ShieldAlert, Brain, LayoutDashboard, ArrowRight, ClipboardCheck, DollarSign,
  History, Target, FileText, ScrollText, LineChart,
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
interface Cfg { enabled: boolean; status: string; vertical: string; persona: string | null; goals: string | null; rules: string | null; businessHours: Window[]; fallbackMessage: string | null; model: string; audioTranscription: boolean; paused: boolean; pausedReason: string | null; scopeMode: string; humanTakeoverMin: number; dailyUsdCap: number | null; disclosureEnabled: boolean; testMode: boolean; testNumbers: string[] }

const VERTICALS: { key: string; label: string }[] = [
  { key: "automotivo", label: "Automotivo (veículos)" },
  { key: "imobiliario", label: "Imobiliário" },
  { key: "servicos", label: "Serviços" },
  { key: "generico", label: "Genérico" },
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
  const [tab, setTab] = useState<"persona" | "operacao" | "guardrails">("persona");

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/config`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCfg({ enabled: d?.enabled ?? false, status: d?.status ?? "draft", vertical: d?.vertical ?? "automotivo", persona: d?.persona ?? "", goals: d?.goals ?? "", rules: d?.rules ?? "", businessHours: d?.businessHours ?? [], fallbackMessage: d?.fallbackMessage ?? "", model: d?.model ?? "gpt-4o-mini", audioTranscription: d?.audioTranscription ?? true, paused: d?.paused ?? false, pausedReason: d?.pausedReason ?? "", scopeMode: d?.scopeMode ?? "all", humanTakeoverMin: d?.humanTakeoverMin ?? 180, dailyUsdCap: d?.dailyUsdCap ?? null, disclosureEnabled: d?.disclosureEnabled ?? true, testMode: d?.testMode ?? false, testNumbers: Array.isArray(d?.testNumbers) ? d.testNumbers : [] });
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

  // Kill-switch de emergência: salva NA HORA (não espera "Salvar configuração").
  async function togglePause() {
    if (!cfg) return;
    const paused = !cfg.paused;
    set({ paused });
    await fetch(`/api/clients/${clientId}/ai/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused }) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Kill-switch de emergência — efeito imediato, sem depender de "Salvar". */}
      <div style={{ ...card, borderColor: cfg.paused ? "var(--red)" : "var(--border)", background: cfg.paused ? "var(--red)" : "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {cfg.paused ? <Pause size={18} color="#fff" /> : <ShieldAlert size={18} color="var(--text-muted)" />}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: cfg.paused ? "#fff" : "var(--text-primary)" }}>{cfg.paused ? "Agente PAUSADO (kill-switch ativo)" : "Parada de emergência"}</div>
            <p style={{ fontSize: 12, color: cfg.paused ? "rgba(255,255,255,.85)" : "var(--text-muted)", marginTop: 2 }}>{cfg.paused ? "A IA não responde ninguém até você retomar." : "Desliga a IA na hora, sem precisar salvar. Use em qualquer imprevisto."}</p>
          </div>
        </div>
        <button onClick={togglePause} style={{ ...btn(), flexShrink: 0, background: cfg.paused ? "#fff" : "var(--red)", color: cfg.paused ? "var(--red)" : "#fff", border: "none" }}>{cfg.paused ? "Retomar agente" : "Pausar agora"}</button>
      </div>

      {/* Sub-navegação da configuração — poucos itens, mesma altitude (aqui a tab horizontal faz sentido) */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
        {([{ k: "persona", l: "Persona" }, { k: "operacao", l: "Operação" }, { k: "guardrails", l: "Guardrails" }] as const).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: tab === t.k ? "var(--accent-soft)" : "transparent", color: tab === t.k ? "var(--accent)" : "var(--text-muted)" }}>{t.l}</button>
        ))}
      </div>

      {tab === "operacao" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      <div style={{ ...card, borderColor: cfg.testMode ? "var(--accent)" : "var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Modo canário (teste em produção)</div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Com isto ligado, mesmo em Produção a IA responde <b>somente</b> os números abaixo. Teste o fluxo real pelo seu WhatsApp sem risco com cliente.</p>
          </div>
          <button onClick={() => set({ testMode: !cfg.testMode })} style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: cfg.testMode ? "var(--accent)" : "var(--border)", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: cfg.testMode ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
          </button>
        </div>
        {cfg.testMode && (
          <div style={{ marginTop: 12 }}>
            <label style={label}>Números liberados (um por linha, com DDD — ex: 5551999990000)</label>
            <textarea style={{ ...input, minHeight: 70, resize: "vertical", fontFamily: "monospace" }}
              value={cfg.testNumbers.join("\n")}
              onChange={(e) => set({ testNumbers: e.target.value.split("\n").map((s) => s.replace(/\D/g, "")).filter(Boolean) })}
              placeholder={"5551999990000\n5551988887777"} />
            {cfg.testNumbers.length === 0 && <p style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>⚠️ Lista vazia: a IA não responderá ninguém enquanto o modo canário estiver ligado.</p>}
          </div>
        )}
      </div>

      <div style={card}>
        <label style={label}>Horário comercial — a IA atua FORA disto (no fuso do cliente)</label>
        <WindowsEditor value={cfg.businessHours} onChange={(w) => set({ businessHours: w })} />
      </div>
      </div>}

      {tab === "persona" && <div style={card}>
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
      </div>}

      {tab === "guardrails" && <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <ShieldAlert size={15} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Segurança & limites</span>
        </div>

        <label style={{ ...label, marginTop: 12 }}>Segmento do cliente (define as regras de bloqueio)</label>
        <select style={input} value={cfg.vertical} onChange={(e) => set({ vertical: e.target.value })}>
          {VERTICALS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
        <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Ex.: automotivo bloqueia desconto/financiamento/troca; imobiliário bloqueia negociar valor e reservar unidade.</p>

        <label style={{ ...label, marginTop: 16 }}>A quem a IA responde</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "Todos os leads", hint: "qualquer mensagem fora do horário" },
            { key: "ads_only", label: "Só leads de anúncio", hint: "ignora quem não veio de campanha" },
          ].map((s) => (
            <button key={s.key} onClick={() => set({ scopeMode: s.key })} style={{ ...btn(cfg.scopeMode === s.key), flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 12px", borderColor: cfg.scopeMode === s.key ? "var(--accent)" : "var(--border)" }}>
              <span>{s.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.85 }}>{s.hint}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
          <div style={{ width: 220 }}>
            <label style={label}>Não assumir se um humano respondeu há (min)</label>
            <input style={input} type="number" min={0} value={cfg.humanTakeoverMin} onChange={(e) => set({ humanTakeoverMin: Number(e.target.value) })} />
            <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Evita a IA falar por cima do vendedor. 0 = desligado.</p>
          </div>
          <div style={{ width: 200 }}>
            <label style={label}>Teto de gasto diário (US$)</label>
            <input style={input} type="number" min={0} step={0.5} value={cfg.dailyUsdCap ?? ""} placeholder="sem limite" onChange={(e) => set({ dailyUsdCap: e.target.value ? Number(e.target.value) : null })} />
            <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Pausa a IA deste cliente ao atingir o valor no dia.</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Avisar que é atendimento automático</div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Anexa o aviso de robô na 1ª mensagem (transparência). Recomendado.</p>
          </div>
          <button onClick={() => set({ disclosureEnabled: !cfg.disclosureEnabled })} style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: cfg.disclosureEnabled ? "var(--green)" : "var(--border)", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: cfg.disclosureEnabled ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
          </button>
        </div>
      </div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {[
          { l: "Turnos", v: m.total },
          { l: "Latência média", v: `${m.avgLatencyMs} ms` },
          { l: "Tokens", v: (m.tokensIn + m.tokensOut).toLocaleString("pt-BR") },
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

// ── Inteligência (insights agregados) ─────────────────────────────────────────
interface Insights {
  windowDays: number; messagesAnalyzed: number;
  intents: { key: string; count: number; pct: number }[];
  sentiments: { key: string; count: number; pct: number }[];
  objections: { type: string; total: number; resolved: number; unresolved: number; resolutionRate: number }[];
  temperatures: { key: string; count: number }[];
  dropRiskLeads: number;
  evaluation: {
    count: number; avgScore: number;
    categories: { key: string; count: number; pct: number }[];
    byVariant: { variant: string; avgScore: number; count: number }[];
    humanReviewPending: number;
  };
}

interface ReviewItem { id: string; leadMessage: string | null; aiMessage: string | null }

function HumanReviewPanel({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  function load() {
    fetch(`/api/clients/${clientId}/ai/reviews`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(Array.isArray(d.items) ? d.items : []); setLoaded(true);
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  async function submit(reviewId: string, body: Record<string, unknown>) {
    setItems((xs) => xs.filter((x) => x.id !== reviewId));
    await fetch(`/api/clients/${clientId}/ai/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewId, ...body }) });
  }

  if (!loaded) return null;
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Revisão humana (ground truth)</div>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>Amostra de conversas para você avaliar — calibra o juiz automático.</p>
      {items.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma revisão pendente. 🎉</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => (
            <div key={it.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
              {it.leadMessage && <div style={{ fontSize: 12, color: "var(--text-muted)" }}><b>Lead:</b> {it.leadMessage}</div>}
              {it.aiMessage && <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2 }}><b>IA:</b> {it.aiMessage}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={() => submit(it.id, { goodResponse: true, natural: true, manualScore: 9 })} style={{ ...btn(), padding: "4px 10px", fontSize: 11, color: "var(--green)" }}>👍 Boa</button>
                <button onClick={() => submit(it.id, { goodResponse: false, missedOpportunity: true, manualScore: 4 })} style={{ ...btn(), padding: "4px 10px", fontSize: 11, color: "var(--red)" }}>👎 Falhou</button>
                <button onClick={() => submit(it.id, { goodResponse: false, seemedBot: true, natural: false, manualScore: 5 })} style={{ ...btn(), padding: "4px 10px", fontSize: 11 }}>🤖 Robótica</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bars({ rows }: { rows: { key: string; count: number; pct: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem dados ainda.</p>}
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)", width: 150, flexShrink: 0 }}>{r.key}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--bg-base)", overflow: "hidden" }}>
            <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)", width: 70, textAlign: "right" }}>{r.count} · {r.pct}%</span>
        </div>
      ))}
    </div>
  );
}

interface Cost { today: number; last7d: number; last30d: number; byPipeline: { pipeline: string; costUsd: number }[]; leads30d: number; costPerLead: number }

function CostCard({ clientId }: { clientId: string }) {
  const [c, setC] = useState<Cost | null>(null);
  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/cost`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setC(d);
    });
  }, [clientId]);
  if (!c) return null;
  const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>Custo de IA</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
        {[{ l: "Hoje", v: c.today }, { l: "7 dias", v: c.last7d }, { l: "30 dias", v: c.last30d }, { l: "Por lead (30d)", v: c.costPerLead }].map((k) => (
          <div key={k.l}>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase" }}>{k.l}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{usd(k.v)}</div>
          </div>
        ))}
      </div>
      {c.byPipeline.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {c.byPipeline.map((p) => (
            <span key={p.pipeline} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "var(--bg-base)", color: "var(--text-secondary)" }}>{p.pipeline}: {usd(p.costUsd)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightsSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/insights?days=${days}`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(d);
    });
  }, [clientId, days]);

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Inteligência comercial dos últimos {data.windowDays} dias · {data.messagesAnalyzed} mensagens analisadas.</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...input, width: 120 }}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {data.temperatures.map((t) => (
          <div key={t.key} style={card}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>{t.key}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{t.count}</div>
          </div>
        ))}
        <div style={{ ...card, borderColor: data.dropRiskLeads > 0 ? "var(--red)" : "var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Risco de perda</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: data.dropRiskLeads > 0 ? "var(--red)" : "var(--text-primary)", marginTop: 4 }}>{data.dropRiskLeads}</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>Principais objeções</div>
        {data.objections.length === 0 ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhuma objeção detectada ainda.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.objections.map((o) => (
              <div key={o.type} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span style={{ width: 110, color: "var(--text-primary)", fontWeight: 600 }}>{o.type}</span>
                <span style={{ flex: 1, color: "var(--text-secondary)" }}>{o.total} ({o.unresolved} abertas)</span>
                <span style={{ fontSize: 11, color: o.resolutionRate >= 50 ? "var(--green)" : "var(--text-muted)" }}>resolvidas {o.resolutionRate}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>Intenções dos leads</div>
        <Bars rows={data.intents} />
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>Temperatura emocional</div>
        <Bars rows={data.sentiments} />
      </div>
    </div>
  );
}

// ── Custos (Operar) ───────────────────────────────────────────────────────────
function CostSection({ clientId }: { clientId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Quanto a IA deste cliente custa — por período e por etapa do pipeline. Fonte única de custo do agente.</p>
      <CostCard clientId={clientId} />
    </div>
  );
}

// ── Avaliação (Validar) — juiz IA, A/B e revisão humana ───────────────────────
function EvaluationSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/insights?days=${days}`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(d);
    });
  }, [clientId, days]);

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;
  const ev = data.evaluation;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Qualidade medida pelo juiz automático nos últimos {data.windowDays} dias.</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...input, width: 120 }}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Qualidade das respostas (juiz IA)</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: ev.avgScore >= 7 ? "var(--green)" : ev.avgScore >= 5 ? "var(--amber, #F59E0B)" : "var(--red)" }}>
            {ev.count ? `${ev.avgScore}/10` : "—"}
          </span>
        </div>
        {ev.count === 0 ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem avaliações ainda.</p> : (
          <>
            <Bars rows={ev.categories} />
            {ev.byVariant.length > 1 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>A/B — score médio por variante</div>
                {ev.byVariant.map((v) => (
                  <div key={v.variant} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{v.variant}</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{v.avgScore}/10 · {v.count}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <HumanReviewPanel clientId={clientId} />
    </div>
  );
}

// ── Visão geral (dashboard de entrada — só leitura + atalhos) ─────────────────
function StatCard({ label, value, hint, tone, onClick }: { label: string; value: React.ReactNode; hint?: string; tone?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...card, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color: tone ?? "var(--text-primary)" }}>{value}</span>
      {hint && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{hint}</span>}
    </button>
  );
}

function OverviewSection({ clientId, onNavigate }: { clientId: string; onNavigate: (s: Section) => void }) {
  const [cfg, setCfg] = useState<{ enabled: boolean; paused: boolean; status: string; dailyUsdCap: number | null } | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const [cost, setCost] = useState<Cost | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/clients/${clientId}/ai/config`).then((r) => r.json()),
      fetch(`/api/clients/${clientId}/ai/insights?days=30`).then((r) => r.json()),
      fetch(`/api/clients/${clientId}/ai/cost`).then((r) => r.json()),
    ]).then(([c, i, co]) => {
      if (!alive) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCfg(c); setIns(i); setCost(co);
    });
    return () => { alive = false; };
  }, [clientId]);

  if (!cfg || !ins || !cost) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  const status = cfg.paused
    ? { txt: "Pausado", tone: "var(--red)", hint: "kill-switch ativo" }
    : !cfg.enabled
    ? { txt: "Desligado", tone: "var(--text-muted)", hint: "não responde leads" }
    : cfg.status === "live"
    ? { txt: "Produção", tone: "var(--green)", hint: "atende leads reais" }
    : cfg.status === "test"
    ? { txt: "Teste", tone: "var(--amber, #F59E0B)", hint: "validação, sem envio real" }
    : { txt: "Rascunho", tone: "var(--text-muted)", hint: "configurando" };

  const hot = ins.temperatures?.find((t) => /hot|quent/i.test(t.key))?.count ?? 0;
  const quality = ins.evaluation?.count ? `${ins.evaluation.avgScore}/10` : "—";
  const reviews = ins.evaluation?.humanReviewPending ?? 0;
  const dropRisk = ins.dropRiskLeads ?? 0;
  const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {cfg.status !== "live" && !cfg.paused && (
        <div style={{ ...card, background: "var(--accent-soft)", borderColor: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Agente ainda não está em produção</div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Configure a persona, valide no Console e passe para Produção quando estiver confiante.</p>
          </div>
          <button onClick={() => onNavigate("config")} style={{ ...btn(true), flexShrink: 0 }}>Configurar <ArrowRight size={14} /></button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <StatCard label="Status" value={status.txt} tone={status.tone} hint={status.hint} onClick={() => onNavigate("config")} />
        <StatCard label="Leads quentes (30d)" value={hot} tone={hot > 0 ? "var(--green)" : undefined} hint="ver inteligência" onClick={() => onNavigate("inteligencia")} />
        <StatCard label="Custo hoje" value={usd(cost.today ?? 0)} hint={cfg.dailyUsdCap ? `teto US$ ${cfg.dailyUsdCap}` : "sem teto"} onClick={() => onNavigate("custos")} />
        <StatCard label="Qualidade (juiz IA)" value={quality} tone={(ins.evaluation?.avgScore ?? 0) >= 7 ? "var(--green)" : undefined} hint="últimos 30 dias" onClick={() => onNavigate("avaliacao")} />
        <StatCard label="Risco de perda" value={dropRisk} tone={dropRisk > 0 ? "var(--red)" : undefined} hint="leads esfriando" onClick={() => onNavigate("inteligencia")} />
        <StatCard label="Revisões pendentes" value={reviews} tone={reviews > 0 ? "var(--amber, #F59E0B)" : undefined} hint="calibrar o juiz" onClick={() => onNavigate("avaliacao")} />
      </div>

      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Resumo de leitura. Toque num cartão para abrir a seção completa.</p>
    </div>
  );
}

// ── Memória (Construir) — o que a IA lembra de cada lead ──────────────────────
interface MemLead { contactId: string; name: string | null; lastSeen: string | null; summary: string; factsCount: number }
interface MemFact { key: string; value: string; updatedAt: string | null }
interface MemDetail { contactId: string; summary: string; rollingSummary: string; facts: MemFact[] }

function MemorySection({ clientId }: { clientId: string }) {
  const [leads, setLeads] = useState<MemLead[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/memory`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeads(Array.isArray(d.leads) ? d.leads : []);
    });
  }, [clientId]);

  function open(contactId: string) {
    setSel(contactId); setDetail(null); setLoadingDetail(true);
    fetch(`/api/clients/${clientId}/ai/memory?contactId=${contactId}`).then((r) => r.json()).then((d) => {
      setDetail(d.detail ?? null); setLoadingDetail(false);
    });
  }

  if (!leads) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>O que a IA <b>lembra</b> de cada lead: um resumo de trabalho da conversa + os fatos já descobertos. Sobrevive entre sessões — lead que volta semanas depois é reconhecido.</p>
      {leads.length === 0 ? (
        <div style={card}><p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>Nenhuma memória ainda. Conforme a IA conversa com leads, os resumos aparecem aqui.</p></div>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 8 }}>
            {leads.map((l) => (
              <button key={l.contactId} onClick={() => open(l.contactId)} style={{ ...card, textAlign: "left", cursor: "pointer", borderColor: sel === l.contactId ? "var(--accent)" : "var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{l.name || "Lead sem nome"}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>{l.lastSeen ? new Date(l.lastSeen).toLocaleDateString("pt-BR") : ""}</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.summary || "(sem resumo)"}</span>
                <span style={{ fontSize: 10.5, color: "var(--accent)" }}>{l.factsCount} fato{l.factsCount === 1 ? "" : "s"} conhecido{l.factsCount === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: "1 1 320px" }}>
            {!sel ? (
              <div style={{ ...card, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>Selecione um lead para ver a memória completa.</div>
            ) : loadingDetail ? (
              <div style={{ ...card, textAlign: "center" }}><Loader2 size={18} className="animate-spin" /></div>
            ) : !detail ? (
              <div style={{ ...card, color: "var(--text-muted)", fontSize: 13 }}>Sem memória para este lead.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={card}>
                  <div style={{ ...label, marginBottom: 6 }}>Resumo da conversa</div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{detail.rollingSummary || "(vazio)"}</div>
                </div>
                <div style={card}>
                  <div style={{ ...label, marginBottom: 8 }}>Fatos do lead</div>
                  {detail.facts.length === 0 ? <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Nenhum fato estruturado ainda.</p> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {detail.facts.map((f, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
                          <span style={{ width: 130, flexShrink: 0, color: "var(--text-muted)", textTransform: "capitalize" }}>{f.key}</span>
                          <span style={{ color: "var(--text-primary)" }}>{f.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Qualificação (Inteligência) — slots + score por lead ──────────────────────
interface QualLead { contactId: string; name: string | null; score: number; temperature: "cold" | "warm" | "hot"; slots: { key: string; value: string | null; filled: boolean }[]; missingSlots: string[]; updatedAt: string }
interface Qual { leads: QualLead[]; distribution: { cold: number; warm: number; hot: number } }

const TEMP_META: Record<string, { label: string; color: string }> = {
  hot: { label: "Quente", color: "var(--red)" },
  warm: { label: "Morno", color: "var(--amber, #F59E0B)" },
  cold: { label: "Frio", color: "var(--text-muted)" },
};

function QualificationSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Qual | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/qualification?days=${days}`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(d);
    });
  }, [clientId, days]);

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;
  const leads = [...data.leads].sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Nota e temperatura de cada lead, com o que já se sabe e o que falta descobrir.</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...input, width: 120 }}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {(["hot", "warm", "cold"] as const).map((t) => (
          <div key={t} style={{ ...card, borderColor: t === "hot" && data.distribution.hot > 0 ? "var(--red)" : "var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>{TEMP_META[t].label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: TEMP_META[t].color, marginTop: 4 }}>{data.distribution[t]}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {leads.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhum lead qualificado no período.</p>}
        {leads.map((l) => (
          <div key={l.contactId} style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{l.name || "Lead sem nome"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: "#fff", background: TEMP_META[l.temperature].color }}>{TEMP_META[l.temperature].label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{l.score}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {l.slots.map((s) => (
                <span key={s.key} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: s.filled ? "none" : "1px dashed var(--border)", background: s.filled ? "var(--accent-soft)" : "transparent", color: s.filled ? "var(--accent)" : "var(--text-muted)" }}>
                  {s.key}{s.filled && s.value ? `: ${s.value}` : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Prompt Lab (Construir) — versões do prompt + teste A/B ────────────────────
interface PromptVersion { id: string; label: string; body: string; active: boolean; isVariant: boolean; abWeight: number | null; persona: string | null; goals: string | null; rules: string | null; extra: string | null }
interface PromptsData { versions: PromptVersion[]; abTest: { enabled: boolean; variants: { id: string; label: string; weight: number }[] } | null }
interface VarDraft { key: string; label: string; active: boolean; weight: number }

function PromptLabSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<PromptsData | null>(null);
  const [vars, setVars] = useState<VarDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ key: "", label: "", persona: "", goals: "", rules: "", extra: "" });

  function load() {
    fetch(`/api/clients/${clientId}/ai/prompts`).then((r) => r.json()).then((d: PromptsData) => {
      setData(d);
      setVars((d.versions || []).filter((v) => v.isVariant).map((v) => ({ key: v.id, label: v.label, active: v.active, weight: v.abWeight ?? 1 })));
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  async function createVariant() {
    if (!f.key.trim()) return;
    setBusy(true);
    await fetch(`/api/clients/${clientId}/ai/prompts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: f.key.trim(), label: f.label.trim() || undefined, persona: f.persona.trim() || null, goals: f.goals.trim() || null, rules: f.rules.trim() || null, extra: f.extra.trim() || null }) });
    setF({ key: "", label: "", persona: "", goals: "", rules: "", extra: "" }); setShowForm(false); setBusy(false); load();
  }
  async function activate(body: object) {
    setBusy(true);
    await fetch(`/api/clients/${clientId}/ai/prompts/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false); load();
  }
  const setVar = (key: string, p: Partial<VarDraft>) => setVars((xs) => xs.map((v) => v.key === key ? { ...v, ...p } : v));

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;
  const base = data.versions.find((v) => !v.isVariant);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Crie <b>variantes</b> do jeito da IA falar e rode um <b>teste A/B</b>: cada lead cai sempre na mesma variante, e a Avaliação mostra qual converte melhor. O prompt-base é editado na Configuração.</p>

      {data.abTest?.enabled && (
        <div style={{ ...card, background: "var(--accent-soft)", borderColor: "var(--accent)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>Teste A/B ativo</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.abTest.variants.map((v) => <span key={v.id} style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 999, background: "var(--bg-surface)", color: "var(--text-secondary)" }}>{v.label} · peso {v.weight}</span>)}
          </div>
        </div>
      )}

      {base && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{base.label}</span>
            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>somente leitura</span>
          </div>
          <pre style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, maxHeight: 160, overflow: "auto" }}>{base.body || "(prompt-base vazio — configure persona/objetivos/regras na Configuração)"}</pre>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ ...label, margin: 0 }}>Variantes</span>
          <button onClick={() => setShowForm((s) => !s)} style={{ ...btn(), padding: "5px 10px", fontSize: 12 }}><Plus size={13} /> Nova variante</button>
        </div>

        {showForm && (
          <div style={card}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px" }}><label style={label}>Chave (ex: B)</label><input style={input} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="B" /></div>
              <div style={{ flex: "1 1 200px" }}><label style={label}>Rótulo</label><input style={input} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Mais empático" /></div>
            </div>
            <label style={{ ...label, marginTop: 12 }}>Persona (sobrescreve o base — opcional)</label>
            <input style={input} value={f.persona} onChange={(e) => setF({ ...f, persona: e.target.value })} placeholder="Ex: mais caloroso e informal" />
            <label style={{ ...label, marginTop: 12 }}>Objetivos (opcional)</label>
            <textarea style={{ ...input, minHeight: 50, resize: "vertical" }} value={f.goals} onChange={(e) => setF({ ...f, goals: e.target.value })} />
            <label style={{ ...label, marginTop: 12 }}>Regras (opcional)</label>
            <textarea style={{ ...input, minHeight: 50, resize: "vertical" }} value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value })} />
            <label style={{ ...label, marginTop: 12 }}>Instruções extras (opcional)</label>
            <textarea style={{ ...input, minHeight: 50, resize: "vertical" }} value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} />
            <button onClick={createVariant} disabled={busy || !f.key.trim()} style={{ ...btn(true), marginTop: 12 }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Criar variante</button>
          </div>
        )}

        {vars.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma variante. Crie uma para testar um estilo diferente contra o prompt-base.</p> : (
          <>
            {vars.map((v) => (
              <div key={v.key} style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={v.active} onChange={(e) => setVar(v.key, { active: e.target.checked })} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{v.label || v.key}</span>
                </label>
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>chave: {v.key}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>peso</span>
                  <input type="number" min={1} max={100} value={v.weight} onChange={(e) => setVar(v.key, { weight: Math.max(1, Number(e.target.value)) })} style={{ ...input, width: 70 }} />
                  <button onClick={() => activate({ key: v.key })} disabled={busy} style={{ ...btn(), padding: "5px 10px", fontSize: 11.5 }}>Ativar só esta</button>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
              <button onClick={() => activate({ variants: vars.filter((v) => v.active).map((v) => ({ key: v.key, weight: v.weight })) })} disabled={busy || vars.filter((v) => v.active).length === 0} style={btn(true)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aplicar split A/B</button>
              <button onClick={() => activate({ key: "base" })} disabled={busy} style={btn()}>Desativar todas (só base)</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Logs avançados (Operar) — raio-x técnico por turno ────────────────────────
interface LogItem { id: string; createdAt: string; contactId: string | null; decision: string | null; status: string; guardrails: string[]; toolCalls: { name: string; ok: boolean; ms: number | null }[]; stages: { name: string; ms: number }[]; tokensIn: number; tokensOut: number; latencyMs: number; model: string | null; promptVariant: string | null; promptVersion: string | null; error: string | null }

const LOG_STATUS: Record<string, string> = { ok: "var(--green)", blocked: "var(--red)", error: "var(--red)", skipped: "var(--text-muted)" };

function LogsSection({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<LogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [first, setFirst] = useState(true);

  function load(cur?: string | null) {
    setLoading(true);
    fetch(`/api/clients/${clientId}/ai/logs?limit=30${cur ? `&cursor=${cur}` : ""}`).then((r) => r.json()).then((d) => {
      setItems((xs) => cur ? [...xs, ...(d.items || [])] : (d.items || []));
      setCursor(d.nextCursor ?? null); setLoading(false); setFirst(false);
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  if (first && loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Detalhe técnico de cada resposta: decisão, tempo por etapa, ferramentas usadas, travas de segurança, tokens e erros. Útil para diagnosticar.</p>
      {items.length === 0 && <div style={card}><p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>Nenhum turno registrado ainda.</p></div>}
      {items.map((it) => (
        <div key={it.id} style={{ ...card, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: "#fff", background: LOG_STATUS[it.status] ?? "var(--text-muted)" }}>{it.decision ?? it.status}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(it.createdAt).toLocaleString("pt-BR")} · {it.latencyMs}ms{it.model ? ` · ${it.model}` : ""}{it.promptVariant ? ` · var ${it.promptVariant}` : ""}</span>
          </div>

          {it.stages.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {it.stages.map((s, i) => <span key={i} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "var(--bg-base)", color: "var(--text-secondary)" }}>{s.name} {s.ms}ms</span>)}
            </div>
          )}
          {it.toolCalls.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {it.toolCalls.map((t, i) => <span key={i} style={{ fontSize: 10.5, color: t.ok ? "var(--text-secondary)" : "var(--red)" }}>🔧 {t.name}{t.ms != null ? ` ${t.ms}ms` : ""}{t.ok ? "" : " ✗"}</span>)}
            </div>
          )}
          {it.guardrails.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {it.guardrails.map((g, i) => <span key={i} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "var(--red)", color: "#fff" }}>⚠ {g}</span>)}
            </div>
          )}
          {it.error && <div style={{ fontSize: 11.5, color: "var(--red)", background: "var(--bg-base)", borderRadius: 6, padding: "6px 8px", marginBottom: 6 }}>{it.error}</div>}
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>tokens {it.tokensIn}↓ / {it.tokensOut}↑</span>
        </div>
      ))}
      {cursor && <button onClick={() => load(cursor)} disabled={loading} style={{ ...btn(), alignSelf: "center" }}>{loading ? <Loader2 size={14} className="animate-spin" /> : "Carregar mais"}</button>}
    </div>
  );
}

// ── Analytics (Inteligência) — séries temporais ───────────────────────────────
interface AnaPoint { date: string; leads: number; answered: number; hot: number; conversions: number; costUsd: number; avgScore: number }
interface Ana { series: AnaPoint[]; totals: { leads: number; conversions: number; costUsd: number } }

function MiniChart({ title, points, color, fmt }: { title: string; points: { date: string; value: number }[]; color: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 70 }}>
        {points.map((p, i) => (
          <div key={i} title={`${new Date(p.date).toLocaleDateString("pt-BR")}: ${fmt ? fmt(p.value) : p.value}`} style={{ flex: 1, minWidth: 2, height: `${(p.value / max) * 100}%`, background: color, borderRadius: 2, opacity: p.value ? 1 : 0.12 }} />
        ))}
      </div>
    </div>
  );
}

function AnalyticsSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Ana | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/analytics?days=${days}`).then((r) => r.json()).then((d) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(d);
    });
  }, [clientId, days]);

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={20} className="animate-spin" /></div>;
  const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Evolução diária de leads, respostas, conversões e custo.</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...input, width: 120 }}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {[{ l: "Leads", v: data.totals.leads }, { l: "Conversões", v: data.totals.conversions }, { l: "Custo total", v: usd(data.totals.costUsd) }].map((k) => (
          <div key={k.l} style={card}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>{k.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <MiniChart title="Leads / dia" points={data.series.map((s) => ({ date: s.date, value: s.leads }))} color="var(--accent)" />
        <MiniChart title="Respondidos / dia" points={data.series.map((s) => ({ date: s.date, value: s.answered }))} color="var(--green)" />
        <MiniChart title="Leads quentes / dia" points={data.series.map((s) => ({ date: s.date, value: s.hot }))} color="var(--red)" />
        <MiniChart title="Conversões / dia" points={data.series.map((s) => ({ date: s.date, value: s.conversions }))} color="var(--green)" />
        <MiniChart title="Custo (US$) / dia" points={data.series.map((s) => ({ date: s.date, value: s.costUsd }))} color="var(--accent)" fmt={usd} />
        <MiniChart title="Nota média / dia" points={data.series.map((s) => ({ date: s.date, value: s.avgScore }))} color="var(--amber, #F59E0B)" />
      </div>
    </div>
  );
}

// ── Root (navegação interna em sidebar, agrupada por modo de uso) ─────────────
type Section = "overview" | "config" | "conhecimento" | "catalogo" | "memoria" | "prompts" | "console" | "avaliacao" | "atividade" | "custos" | "logs" | "inteligencia" | "qualificacao" | "analytics";

export function AiAgentTab({ clientId }: { clientId: string }) {
  const [section, setSection] = useState<Section>("overview");

  const nav: { group?: string; items: { key: Section; label: string; icon: React.ReactNode }[] }[] = [
    { items: [{ key: "overview", label: "Visão geral", icon: <LayoutDashboard size={14} /> }] },
    { group: "Construir", items: [
      { key: "config", label: "Configuração", icon: <Bot size={14} /> },
      { key: "conhecimento", label: "Conhecimento", icon: <BookOpen size={14} /> },
      { key: "catalogo", label: "Estoque", icon: <Package size={14} /> },
      { key: "prompts", label: "Prompt Lab", icon: <FileText size={14} /> },
      { key: "memoria", label: "Memória", icon: <History size={14} /> },
    ] },
    { group: "Validar", items: [
      { key: "console", label: "Console", icon: <FlaskConical size={14} /> },
      { key: "avaliacao", label: "Avaliação", icon: <ClipboardCheck size={14} /> },
    ] },
    { group: "Operar", items: [
      { key: "atividade", label: "Atividade", icon: <Activity size={14} /> },
      { key: "custos", label: "Custos", icon: <DollarSign size={14} /> },
      { key: "logs", label: "Logs", icon: <ScrollText size={14} /> },
    ] },
    { group: "Inteligência", items: [
      { key: "inteligencia", label: "Inteligência", icon: <Brain size={14} /> },
      { key: "qualificacao", label: "Qualificação", icon: <Target size={14} /> },
      { key: "analytics", label: "Analytics", icon: <LineChart size={14} /> },
    ] },
  ];

  const navItem = (it: { key: Section; label: string; icon: React.ReactNode }) => (
    <button key={it.key} onClick={() => setSection(it.key)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: section === it.key ? "var(--accent-soft)" : "transparent", color: section === it.key ? "var(--accent)" : "var(--text-secondary)" }}>
      {it.icon} {it.label}
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <aside style={{ width: 200, flexShrink: 0, position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {nav.map((grp, gi) => (
          <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {grp.group && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6, padding: "4px 10px" }}>{grp.group}</div>}
            {grp.items.map(navItem)}
          </div>
        ))}
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        {section === "overview" && <OverviewSection clientId={clientId} onNavigate={setSection} />}
        {section === "config" && <ConfigSection clientId={clientId} />}
        {section === "console" && <ConsoleSection clientId={clientId} />}
        {section === "avaliacao" && <EvaluationSection clientId={clientId} />}
        {section === "catalogo" && <CatalogSection clientId={clientId} />}
        {section === "conhecimento" && <KnowledgeSection clientId={clientId} />}
        {section === "memoria" && <MemorySection clientId={clientId} />}
        {section === "prompts" && <PromptLabSection clientId={clientId} />}
        {section === "inteligencia" && <InsightsSection clientId={clientId} />}
        {section === "qualificacao" && <QualificationSection clientId={clientId} />}
        {section === "analytics" && <AnalyticsSection clientId={clientId} />}
        {section === "atividade" && <ActivitySection clientId={clientId} />}
        {section === "custos" && <CostSection clientId={clientId} />}
        {section === "logs" && <LogsSection clientId={clientId} />}
      </div>
    </div>
  );
}
