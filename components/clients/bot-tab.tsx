"use client";

import { useEffect, useState } from "react";
import { Send, Copy, Check, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabHeader } from "@/components/clients/tab-header";
import { PortalAccessCard } from "@/components/clients/portal-access-card";

interface Recipient { id: string; username: string | null; role: string; createdAt: string }
interface BotState {
  connected: boolean;
  username: string | null;
  brandName: string | null;
  welcomeMessage: string | null;
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

type Section = "conexao" | "aparencia" | "alertas" | "destinatarios" | "painel";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "conexao", label: "Conexão" },
  { key: "aparencia", label: "Aparência" },
  { key: "alertas", label: "Alertas" },
  { key: "destinatarios", label: "Destinatários" },
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

// Preview de uma mensagem do bot ("ver como o cliente vê") — bolha estilo Telegram.
function AlertPreview() {
  return (
    <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>Prévia — como chega no Telegram do cliente</div>
      <div style={{ maxWidth: 320, background: "#fff", color: "#101319", borderRadius: "12px 12px 12px 4px", padding: "10px 12px", fontSize: 13, lineHeight: 1.5, boxShadow: "0 1px 2px rgba(0,0,0,.08)" }}>
        <div>🔥 <b>Lead QUENTE parado há 18 min</b></div>
        <div>👤 João Silva</div>
        <div>⚠️ Você está prestes a perder — responda agora.</div>
        <div style={{ marginTop: 8, color: "#2481CC", fontWeight: 600 }}>💬 Responder no WhatsApp →</div>
      </div>
    </div>
  );
}

export function BotTab({ clientId }: { clientId: string }) {
  const [state, setState] = useState<BotState | null>(null);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [welcome, setWelcome] = useState("");
  const [brandSaved, setBrandSaved] = useState(false);
  const [excluded, setExcluded] = useState("");
  const [section, setSection] = useState<Section>("conexao");
  const [portal, setPortal] = useState<{ link: string; accentColor: string | null; mode: string; logoUrl: string | null } | null>(null);
  const [portalCopied, setPortalCopied] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/bot`);
    if (res.ok) { const d = await res.json(); setState(d); setUsername(d.username ?? ""); setBrand(d.brandName ?? ""); setWelcome(d.welcomeMessage ?? ""); setExcluded(d.excludedNames ?? ""); }
  }

  async function saveBrand() {
    setBrandSaved(false);
    await patch({ brandName: brand, welcomeMessage: welcome });
    setBrandSaved(true);
    setTimeout(() => setBrandSaved(false), 2500);
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

  async function connect() {
    setErr(null); setBusy(true);
    const res = await fetch(`/api/clients/${clientId}/bot`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim(), username: username.trim() }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({})))?.error ?? "Falha ao conectar."); return; }
    setToken(""); await load();
  }

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/clients/${clientId}/bot`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  function toggleAlert(key: keyof BotState["alerts"]) {
    if (!state) return;
    const next = !state.alerts[key];
    setState({ ...state, alerts: { ...state.alerts, [key]: next } });
    void patch({ [key]: next });
  }

  async function genInvite() {
    setInvite(null); setCopied(false);
    const res = await fetch(`/api/clients/${clientId}/bot/invite`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    if (res.ok) setInvite((await res.json()).link);
  }

  async function removeRecipient(rid: string) {
    await fetch(`/api/clients/${clientId}/bot/recipients/${rid}`, { method: "DELETE" });
    await load();
  }

  async function test() {
    setTestMsg(null);
    const res = await fetch(`/api/clients/${clientId}/bot/test`, { method: "POST" });
    const { sent } = await res.json();
    setTestMsg(sent > 0 ? `✅ Enviado para ${sent} destinatário(s).` : "Nenhum destinatário conectado ainda.");
  }

  if (!state) return <div style={{ padding: 40, color: "var(--text-muted)" }}><Loader2 size={16} className="animate-spin" /></div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>
      <TabHeader icon={<Send size={16} />} tint="rgba(36,129,204,0.12)" iconColor="#2481CC" title="BOT do Telegram" subtitle="Alertas em tempo real dos leads deste cliente" />
      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Bot do Telegram exclusivo deste cliente. Crie um bot no <b>@BotFather</b>, cole o token aqui e conecte os
        responsáveis — eles recebem em tempo real os alertas dos leads <b>só deste cliente</b>.
      </p>

      {state.connected && <SubNav active={section} onChange={setSection} />}

      {/* Conexão */}
      {(!state.connected || section === "conexao") && (
      <Card title="🔌 Conexão">
        {state.connected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>Conectado a <b>@{state.username}</b></span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" size="sm" onClick={test}><Send size={12} /> Testar</Button>
                <Button variant="ghost" size="sm" onClick={() => { setToken(""); setState({ ...state, connected: false }); }}><RefreshCw size={12} /> Trocar token</Button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {state.recipients.length} destinatário{state.recipients.length !== 1 ? "s" : ""} · último alerta {timeAgo(state.lastAlertAt)}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Token do BotFather" placeholder="123456789:ABCdef..." value={token} onChange={(e) => setToken(e.target.value)} />
            <Input label="@username do bot (sem @)" placeholder="imobiliariax_bot" value={username} onChange={(e) => setUsername(e.target.value)} />
            {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
            <div><Button variant="primary" size="sm" loading={busy} onClick={connect} disabled={!token.trim() || !username.trim()}>Conectar bot</Button></div>
          </div>
        )}
        {testMsg && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>{testMsg}</p>}
      </Card>
      )}

      {/* Painel do cliente (dashboard sem login) */}
      {state.connected && section === "painel" && (
      <Card title="📊 Painel do cliente">
        {!portal ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Carregando…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Link <b>sem login</b> com o painel de performance do cliente (marca dele). Envie ou use o comando <b>/painel</b> no bot.
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

      {state.connected && section === "painel" && <PortalAccessCard clientId={clientId} />}

      {/* Marca branca */}
      {state.connected && section === "aparencia" && (
        <Card title="🎨 Marca branca">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Nome da marca" placeholder="Ex.: Imobiliária Boqueirão" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>Mensagem de boas-vindas</label>
              <textarea
                value={welcome}
                onChange={(e) => setWelcome(e.target.value)}
                placeholder="Texto enviado quando alguém conecta (deixe vazio para o padrão)."
                rows={3}
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-input)", color: "var(--text-primary)", padding: "9px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              O nome também é aplicado como nome do bot no Telegram (o avatar é definido no @BotFather). Suporta <b>&lt;b&gt;negrito&lt;/b&gt;</b> na boas-vindas.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Button variant="primary" size="sm" onClick={saveBrand}>Salvar marca</Button>
              {brandSaved && <span style={{ fontSize: 12, color: "var(--green)" }}>✓ Salvo</span>}
            </div>
          </div>
        </Card>
      )}

      {/* Ignorar contatos */}
      {state.connected && section === "alertas" && (
        <Card title="🙈 Ignorar contatos">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Nomes/sobrenomes que <b>não</b> devem virar lead nem gerar alerta (ex.: família do dono). Um por linha ou separados por vírgula.
            </p>
            <textarea
              value={excluded}
              onChange={(e) => setExcluded(e.target.value)}
              onBlur={() => void patch({ excludedNames: excluded })}
              placeholder="Erling"
              rows={2}
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-input)", color: "var(--text-primary)", padding: "9px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </Card>
      )}

      {/* Destinatários */}
      {state.connected && section === "destinatarios" && (
        <Card title="👥 Destinatários">
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={genInvite}>Gerar link de convite</Button>
          </div>
          {invite && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{invite}</span>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(invite); setCopied(true); }}>
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
            Envie o link ao responsável. Ele abre, toca em <b>Iniciar</b> e passa a <b>receber os alertas</b> — sem acesso ao painel nem como alterar o bot. O link vale 24h e é de uso único.
          </p>
          {state.recipients.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Ninguém conectado ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {state.recipients.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-base)", borderRadius: 8 }}>
                  <span style={{ fontSize: 12.5, color: "var(--text-primary)" }}>
                    {r.username ? `@${r.username}` : "Conectado"} <span style={{ color: "var(--text-muted)" }}>· só recebe</span>
                  </span>
                  <button type="button" onClick={() => removeRecipient(r.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Alertas */}
      {state.connected && section === "alertas" && (
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
        </Card>
      )}

      {state.connected && section === "alertas" && <AlertPreview />}
      </div>
    </div>
  );
}
