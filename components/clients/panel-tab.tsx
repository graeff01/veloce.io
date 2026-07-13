"use client";

import { useEffect, useState } from "react";
import { Copy, Check, RefreshCw, Trash2, Loader2, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Portal { link: string; accentColor: string | null; mode: string; active: boolean; requireLogin: boolean; maxUsers: number; logoUrl: string | null }
interface PortalUser { id: string; email: string; name: string | null; role: string; lastLoginAt: string | null; hasPassword: boolean }

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>{icon}{title}</h3>
      {children}
    </div>
  );
}

export function PanelTab({ clientId }: { clientId: string }) {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadPortal() { const r = await fetch(`/api/clients/${clientId}/portal`); if (r.ok) setPortal(await r.json()); }
  async function loadUsers() { const r = await fetch(`/api/clients/${clientId}/portal-access`); if (r.ok) { const d = await r.json(); setUsers(d.users ?? []); } }
  async function savePortal(body: Record<string, unknown>) {
    const r = await fetch(`/api/clients/${clientId}/portal`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) setPortal(await r.json());
  }
  async function removeUser(email: string) {
    if (!confirm(`Remover o acesso de ${email}? A sessão dele é derrubada e a vaga fica livre.`)) return;
    await fetch(`/api/clients/${clientId}/portal-access?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    loadUsers();
  }
  async function setRole(email: string, role: string) {
    const r = await fetch(`/api/clients/${clientId}/portal-access`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || "Não foi possível mudar o papel."); }
    loadUsers();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { loadPortal(); loadUsers(); }, [clientId]);

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
    void savePortal({ accentColor: hex });
  }

  if (!portal) return <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Carregando…</p>;

  const registered = (users ?? []).filter((u) => u.hasPassword).length;
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

  return (
    <div>
      {/* Link do painel */}
      <Card title="📊 Painel do cliente">
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
          Link <b>fixo</b> do painel do cliente (na marca dele). É o mesmo link sempre — o usuário abre e cria login+senha ali. Envie ou use o comando <b>/painel</b> no WhatsApp.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{portal.link}</span>
          <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(portal.link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "Copiar"}
          </Button>
          <a href={portal.link} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm">Abrir</Button></a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            Cor da marca
            <input type="color" value={portal.accentColor ?? "#1e66f5"} onChange={(e) => void savePortal({ accentColor: e.target.value })}
              style={{ width: 36, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "none", cursor: "pointer" }} />
          </label>
          {portal.logoUrl && <Button variant="ghost" size="sm" onClick={fromLogo}>🎨 Gerar do logo</Button>}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            Modo
            <select value={portal.mode} onChange={(e) => void savePortal({ mode: e.target.value })}
              style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", padding: "5px 8px", fontSize: 12.5 }}>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
              <option value="auto">Auto (segue o aparelho)</option>
            </select>
          </label>
          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Gerar um novo link? O link atual deixa de funcionar para todos.")) void savePortal({ rotate: true }); }}>
            <RefreshCw size={12} /> Novo link
          </Button>
        </div>
      </Card>

      {/* Login + senha */}
      <Card title="Acesso ao painel (login e senha)" icon={<Lock size={13} />}>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, marginBottom: 14, background: portal.requireLogin ? "color-mix(in srgb, var(--green) 10%, transparent)" : "var(--bg-base)", border: `1px solid ${portal.requireLogin ? "color-mix(in srgb, var(--green) 30%, transparent)" : "var(--border)"}`, color: "var(--text-secondary)" }}>
          {portal.requireLogin
            ? <><b style={{ color: "var(--green)" }}>Login LIGADO.</b> Cada pessoa cria o próprio login+senha pelo link, até o limite de usuários abaixo.</>
            : <><b>Painel aberto pelo link.</b> Ligue o login pra exigir e-mail+senha e proteger as métricas + conversas.</>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-primary)", cursor: "pointer" }}>
            <input type="checkbox" checked={portal.requireLogin} onChange={(e) => void savePortal({ requireLogin: e.target.checked })} />
            Exigir login e senha
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            Máximo de usuários
            <input type="number" min={1} max={50} value={portal.maxUsers} onChange={(e) => setPortal({ ...portal, maxUsers: Number(e.target.value) })} onBlur={(e) => void savePortal({ maxUsers: Number(e.target.value) })}
              style={{ width: 64, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", padding: "5px 8px", fontSize: 12.5 }} />
          </label>
        </div>
      </Card>

      {/* Usuários cadastrados */}
      <Card title={`Usuários (${registered}/${portal.maxUsers})`} icon={<Users size={13} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {users === null ? <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-muted)" }} />
            : users.length === 0 ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Ninguém cadastrado ainda. Envie o link para o cliente criar o acesso.</p>
            : users.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-base)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name ? `${u.name} · ` : ""}{u.email}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.hasPassword ? `último acesso ${fmtDate(u.lastLoginAt)}` : "convidado (ainda sem senha)"}</div>
                </div>
                <button onClick={() => setRole(u.email, u.role === "admin" ? "attendant" : "admin")} title="Clique para alternar admin/atendente"
                  style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, padding: "3px 9px", borderRadius: 20, cursor: "pointer", border: `1px solid ${u.role === "admin" ? "var(--accent)" : "var(--border)"}`, background: u.role === "admin" ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent", color: u.role === "admin" ? "var(--accent)" : "var(--text-muted)" }}>
                  {u.role === "admin" ? "Admin" : "Atendente"}
                </button>
                <button onClick={() => removeUser(u.email)} title="Remover acesso" style={{ display: "inline-flex", padding: 5, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--red)", cursor: "pointer" }}><Trash2 size={12} /></button>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
