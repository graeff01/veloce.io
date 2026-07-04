"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Copy, Check, Trash2, RefreshCw, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabHeader } from "@/components/clients/tab-header";
import { PortalAccessCard } from "@/components/clients/portal-access-card";

interface Recipient { id: string; role: string; channel: string; waId: string | null; createdAt: string }
interface BotState {
  connected: boolean;
  brandName: string | null;
  excludedNames: string | null;
  alerts: { novoLead: boolean; slaAlerts: boolean; leadQuente: boolean; leadEsfriando: boolean; resumoDiario: boolean };
  quietStart: string | null;
  quietEnd: string | null;
  lastAlertAt: string | null;
  recipients: Recipient[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "nenhum ainda";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)}h`;
  return `há ${Math.floor(min / 1440)}d`;
}

// Formata um waId (só dígitos) como +55 (51) 99999-9999 — best-effort.
function fmtWa(waId: string | null): string {
  const d = (waId || "").replace(/\D/g, "");
  if (d.length < 12) return waId || "";
  const ddd = d.slice(2, 4), rest = d.slice(4);
  const mid = rest.length > 8 ? rest.slice(0, 5) : rest.slice(0, 4);
  const end = rest.length > 8 ? rest.slice(5) : rest.slice(4);
  return `+${d.slice(0, 2)} (${ddd}) ${mid}-${end}`;
}

const ALERTS: { key: keyof BotState["alerts"]; label: string; desc: string }[] = [
  { key: "novoLead",      label: "🚨 Novo lead",         desc: "Avisa na 1ª mensagem de um lead novo" },
  { key: "slaAlerts",     label: "⏱️ Tempo de resposta",  desc: "Lead aguardando há muito tempo (5/15/30 min)" },
  { key: "leadQuente",    label: "🔥 Lead quente",        desc: "Lead com sinais fortes de compra" },
  { key: "leadEsfriando", label: "🧊 Lead esfriando",     desc: "Lead sem retorno, esfriando no funil" },
  { key: "resumoDiario",  label: "📊 Resumo diário",      desc: "Placar do atendimento do dia" },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{
      width: 38, height: 22, borderRadius: 20, border: "none", cursor: "pointer", flexShrink: 0,
      background: on ? "var(--accent)" : "var(--border)", position: "relative", transition: "background 150ms",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left 150ms",
      }} />
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>{title}</h3>
      {children}
    </div>
  );
}

type Section = "destinatarios" | "alertas" | "painel";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "destinatarios", label: "Destinatários" },
  { key: "alertas", label: "Alertas" },
  { key: "painel", label: "Painel" },
];

function SubNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
      {SECTIONS.map((s) => {
        const on = active === s.key;
        return (
          <button key={s.key} type="button" onClick={() => onChange(s.key)} style={{
            padding: "6px 14px", borderRadius: 8, border: "1px solid " + (on ? "transparent" : "var(--border)"),
            background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--text-muted)",
            fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: "pointer",
          }}>{s.label}</button>
        );
      })}
    </div>
  );
}

// Prévia de um alerta — bolha estilo WhatsApp (como chega no zap do dono).
function AlertPreview() {
  return (
    <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>Prévia — como chega no WhatsApp do dono</div>
      <div style={{ maxWidth: 320, background: "color-mix(in srgb, #1FA855 16%, #fff)", color: "#101319", borderRadius: "12px 12px 12px 4px", padding: "10px 12px", fontSize: 13, lineHeight: 1.5, boxShadow: "0 1px 2px rgba(0,0,0,.08)" }}>
        <div><b>🔥 Lead QUENTE parado há 18 min</b></div>
        <div>👤 João Silva</div>
        <div>⚠️ Você está prestes a perder — responda agora.</div>
        <div style={{ marginTop: 8, color: "#1FA855", fontWeight: 600 }}>Falar com o lead: wa.me/55…</div>
      </div>
    </div>
  );
}

export function BotTab({ clientId }: { clientId: string }) {
  const [state, setState] = useState<BotState | null>(null);
  const [newWa, setNewWa] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [excluded, setExcluded] = useState("");
  const [section, setSection] = useState<Section>("destinatarios");
  const [portal, setPortal] = useState<{ link: string; accentColor: string | null; mode: string; logoUrl: string | null } | null>(null);
  const [portalCopied, setPortalCopied] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/bot`);
    if (res.ok) { const d = await res.json(); setState(d); setExcluded(d.excludedNames ?? ""); }
  }

  async function loadPortal() {
    const res = await fetch(`/api/clients/${clientId}/portal`);
    if (res.ok) setPortal(await res.json());
  }
  async function savePortal(body: Record<string, unknown>) {
    const res = await fetch(`/api/clients/${clientId}/portal`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) setPortal(await res.json());
  }

  // Extrai a cor "de marca" do logo (média dos pixels, ignorando transparente e quase branco/preto).
  function colorFromLogo(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const s = 40, c = document.createElement("canvas"); c.width = s; c.height = s;
          const ctx = c.getContext("2d"); if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, s, s);
          const d = ctx.getImageData(0, 0, s, s).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if ((mx > 240 && mn > 240) || mx < 15) continue;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
          if (!n) return resolve(null);
          const h = (x: number) => Math.round(x / n).toString(16).padStart(2, "0");
          resolve(`#${h(r)}${h(g)}${h(b)}`);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
  async function fromLogo() {
    if (!portal?.logoUrl) return;
    const hex = await colorFromLogo(portal.logoUrl);
    if (!hex) { alert("Não consegui ler a cor do logo automaticamente. Escolha a cor manualmente."); return; }
    setPortal({ ...portal, accentColor: hex }); void savePortal({ accentColor: hex });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); loadPortal(); }, [clientId]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/clients/${clientId}/bot`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  function toggleAlert(key: keyof BotState["alerts"]) {
    if (!state) return;
    const next = !state.alerts[key];
    setState({ ...state, alerts: { ...state.alerts, [key]: next } });
    void patch({ [key]: next });
  }

  async function addRecipient() {
    setErr(null); setAdding(true);
    const res = await fetch(`/api/clients/${clientId}/bot/recipients`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waId: newWa.trim() }),
    });
    setAdding(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({})))?.error ?? "Falha ao cadastrar o número."); return; }
    setNewWa(""); await load();
  }

  async function removeRecipient(rid: string) {
    await fetch(`/api/clients/${clientId}/bot/recipients/${rid}`, { method: "DELETE" });
    await load();
  }

  async function test() {
    setTestMsg(null);
    const res = await fetch(`/api/clients/${clientId}/bot/test`, { method: "POST" });
    const { sent } = await res.json();
    setTestMsg(sent > 0 ? `✅ Enviado para ${sent} destinatário(s).` : "Nenhum destinatário na janela aberta — o alerta fica retido até o dono mandar mensagem.");
  }

  if (!state) return <div style={{ padding: 40, color: "var(--text-muted)" }}><Loader2 size={16} className="animate-spin" /></div>;

  const waRecipients = state.recipients.filter((r) => r.channel === "whatsapp");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>
      <TabHeader icon={<MessageCircle size={16} />} tint="rgba(31,168,85,0.12)" iconColor="#1FA855" title="Alertas no WhatsApp" subtitle="Alertas e comandos dos leads, no WhatsApp do dono" />
      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Os alertas saem pela <b>própria linha da loja</b> (a mesma que atende lead) para o <b>WhatsApp pessoal do dono</b>.
        Cadastre o número dele abaixo. Ele também consulta a operação por comandos: <b>/quentes · /status · /resultados</b>.
        Dentro da janela de 24h é grátis; fora, o alerta fica retido e chega junto quando ele reabrir a conversa.
      </p>

      <SubNav active={section} onChange={setSection} />

      {/* Destinatários */}
      {section === "destinatarios" && (
        <Card title="👥 Número do dono">
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Input label="WhatsApp do dono (com DDD)" placeholder="5551999999999" value={newWa} onChange={(e) => setNewWa(e.target.value)} />
            </div>
            <Button variant="primary" size="sm" loading={adding} onClick={addRecipient} disabled={!newWa.trim()}><Plus size={12} /> Cadastrar</Button>
            <Button variant="secondary" size="sm" onClick={test}>Testar alerta</Button>
          </div>
          {err && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 10 }}>{err}</p>}
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
            Use o WhatsApp <b>pessoal</b> do dono — diferente da linha que atende cliente. Ele passa a <b>receber os alertas</b> e pode usar os comandos.
          </p>
          {waRecipients.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum número cadastrado ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {waRecipients.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-base)", borderRadius: 8 }}>
                  <span style={{ fontSize: 12.5, color: "var(--text-primary)" }}>
                    {fmtWa(r.waId)} <span style={{ color: "var(--text-muted)" }}>· {r.role === "dono" ? "dono" : r.role}</span>
                  </span>
                  <button type="button" onClick={() => removeRecipient(r.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 12 }}>
            {waRecipients.length} destinatário{waRecipients.length !== 1 ? "s" : ""} · último alerta {timeAgo(state.lastAlertAt)}
          </div>
          {testMsg && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>{testMsg}</p>}
        </Card>
      )}

      {/* Alertas */}
      {section === "alertas" && (
        <Card title="🔔 Alertas">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ALERTS.map((a) => (
              <div key={a.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{a.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{a.desc}</div>
                </div>
                <Toggle on={state.alerts[a.key]} onClick={() => toggleAlert(a.key)} />
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 8 }}>🌙 Não perturbe</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="time" value={state.quietStart ?? ""} onChange={(e) => { setState({ ...state, quietStart: e.target.value }); void patch({ quietStart: e.target.value }); }}
                style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", padding: "6px 10px", fontSize: 13 }} />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>até</span>
              <input type="time" value={state.quietEnd ?? ""} onChange={(e) => { setState({ ...state, quietEnd: e.target.value }); void patch({ quietEnd: e.target.value }); }}
                style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", padding: "6px 10px", fontSize: 13 }} />
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>(fora disso, só alertas críticos)</span>
            </div>
          </div>
          {/* Ignorar contatos */}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>🙈 Ignorar contatos</div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
              Nomes/sobrenomes que <b>não</b> devem virar lead nem gerar alerta (ex.: família do dono). Um por linha ou separados por vírgula.
            </p>
            <textarea
              value={excluded}
              onChange={(e) => setExcluded(e.target.value)}
              onBlur={() => void patch({ excludedNames: excluded })}
              placeholder="Erling"
              rows={2}
              style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-input)", color: "var(--text-primary)", padding: "9px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </Card>
      )}

      {section === "alertas" && <AlertPreview />}

      {/* Painel do cliente (dashboard sem login) */}
      {section === "painel" && (
      <Card title="📊 Painel do cliente">
        {!portal ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Carregando…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Link <b>sem login</b> com o painel de performance do cliente (marca dele). Envie ou use o comando <b>/painel</b> no WhatsApp.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{portal.link}</span>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(portal.link); setPortalCopied(true); setTimeout(() => setPortalCopied(false), 2000); }}>
                {portalCopied ? <Check size={12} /> : <Copy size={12} />} {portalCopied ? "Copiado" : "Copiar"}
              </Button>
              <a href={portal.link} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm">Abrir</Button></a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
                Cor da marca
                <input type="color" value={portal.accentColor ?? "#1e66f5"} onChange={(e) => { setPortal({ ...portal, accentColor: e.target.value }); void savePortal({ accentColor: e.target.value }); }}
                  style={{ width: 36, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "none", cursor: "pointer" }} />
              </label>
              {portal.logoUrl && <Button variant="ghost" size="sm" onClick={fromLogo}>🎨 Gerar do logo</Button>}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
                Modo
                <select value={portal.mode} onChange={(e) => { setPortal({ ...portal, mode: e.target.value }); void savePortal({ mode: e.target.value }); }}
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", padding: "5px 8px", fontSize: 12.5 }}>
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                  <option value="auto">Auto (segue o aparelho)</option>
                </select>
              </label>
              <Button variant="ghost" size="sm" onClick={() => { if (confirm("Gerar um novo link? O link atual deixa de funcionar.")) void savePortal({ rotate: true }); }}>
                <RefreshCw size={12} /> Novo link
              </Button>
            </div>
          </div>
        )}
      </Card>
      )}

      {section === "painel" && <PortalAccessCard clientId={clientId} />}
      </div>
    </div>
  );
}
