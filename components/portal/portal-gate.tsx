"use client";

import { useState } from "react";
import { Mail, Lock, User } from "lucide-react";

// Tela de acesso do painel do cliente: LOGIN (e-mail + senha) e CRIAR CONTA
// (auto-cadastro pelo link fixo). Mostra o logo real do cliente. Mesma tela mobile/web.
export function PortalGate({ token, brandName, logoUrl }: { token: string; brandName: string; logoUrl?: string | null }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [logoOk, setLogoOk] = useState(true);

  async function submit() {
    setErr("");
    if (!email.includes("@")) { setErr("Digite um e-mail válido."); return; }
    if (password.length < 8) { setErr("A senha precisa de ao menos 8 caracteres."); return; }
    setBusy(true);
    const path = mode === "login" ? "login" : "register";
    const body = mode === "login" ? { email, password } : { email, password, name };
    const r = await fetch(`/api/portal/${token}/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Não foi possível acessar."); return; }
    window.location.reload();
  }

  const tab = (m: "login" | "register"): React.CSSProperties => ({
    flex: 1, height: 38, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700,
    background: mode === m ? "var(--p-surface)" : "transparent", color: mode === m ? "var(--p-text)" : "var(--p-muted)",
    boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,.12)" : "none", transition: "background .15s, color .15s",
  });

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`
        .pg-field{display:flex;align-items:center;gap:10px;height:52px;padding:0 14px;border-radius:13px;border:1.5px solid var(--p-border);background:var(--p-bg);transition:border-color .15s, box-shadow .15s;margin-top:11px}
        .pg-field:focus-within{border-color:var(--p-accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--p-accent) 16%, transparent)}
        .pg-field input{flex:1;border:none;outline:none;background:transparent;color:var(--p-text);font-size:16px}
        .pg-field input::placeholder{color:var(--p-muted)}
        .pg-btn{width:100%;height:50px;border-radius:13px;border:none;background:var(--p-accent);color:var(--p-on-accent);font-size:15px;font-weight:700;cursor:pointer;margin-top:16px;transition:filter .15s, opacity .15s}
        .pg-btn:hover{filter:brightness(1.05)}
      `}</style>
      <div style={{ width: "100%", maxWidth: 400, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 22, padding: 30, boxShadow: "0 20px 60px rgba(0,0,0,.14)" }}>
        {/* Logo real do cliente (fallback: inicial da marca) */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: logoUrl && logoOk ? "var(--p-bg)" : "var(--p-accent)", border: "1px solid var(--p-border)" }}>
            {logoUrl && logoOk
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt={brandName} onError={() => setLogoOk(false)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              : <span style={{ fontWeight: 800, fontSize: 30, color: "var(--p-on-accent)" }}>{brandName[0]?.toUpperCase()}</span>}
          </div>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--p-text)", textAlign: "center" }}>{brandName}</h1>
        <p style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 4, textAlign: "center", lineHeight: 1.45 }}>
          {mode === "login" ? "Entre com seu e-mail e senha para acessar o painel." : "Crie seu acesso ao painel com e-mail e senha."}
        </p>

        <div style={{ display: "flex", gap: 4, background: "var(--p-bg)", border: "1px solid var(--p-border)", borderRadius: 11, padding: 4, marginTop: 20 }}>
          <button onClick={() => { setMode("login"); setErr(""); }} style={tab("login")}>Entrar</button>
          <button onClick={() => { setMode("register"); setErr(""); }} style={tab("register")}>Criar conta</button>
        </div>

        {mode === "register" && (
          <div className="pg-field">
            <User size={18} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome (opcional)" autoComplete="name" />
          </div>
        )}
        <div className="pg-field">
          <Mail size={18} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="seu@email.com" autoComplete="email" inputMode="email" />
        </div>
        <div className="pg-field">
          <Lock size={18} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha (mín. 8 caracteres)" autoComplete={mode === "login" ? "current-password" : "new-password"} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        </div>

        {err && <p style={{ fontSize: 12.5, color: "#d6453d", marginTop: 12, textAlign: "center" }}>{err}</p>}

        <button onClick={() => void submit()} disabled={busy} className="pg-btn" style={{ opacity: busy ? 0.6 : 1 }}>
          {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta e entrar"}
        </button>

        <p style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 16, textAlign: "center" }}>
          {mode === "login" ? "Ainda não tem acesso? Toque em “Criar conta”." : "Já tem conta? Toque em “Entrar”."}
        </p>
        {mode === "login" && (
          <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 6, textAlign: "center", opacity: 0.85 }}>
            Esqueceu a senha? Peça ao admin do painel para resetar seu acesso.
          </p>
        )}
      </div>
    </div>
  );
}
