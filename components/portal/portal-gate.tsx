"use client";

import { useState } from "react";

// Tela de acesso do painel do cliente: LOGIN (e-mail + senha) e CRIAR CONTA
// (auto-cadastro pelo link fixo, limitado por painel). Mesma tela no mobile e no web.
export function PortalGate({ token, brandName }: { token: string; brandName: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    window.location.reload(); // sessão criada → o servidor renderiza o painel
  }

  const field: React.CSSProperties = { width: "100%", height: 46, borderRadius: 11, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", padding: "0 14px", fontSize: 16, boxSizing: "border-box", marginTop: 10 };
  const btn: React.CSSProperties = { width: "100%", height: 46, borderRadius: 11, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 14, opacity: busy ? 0.6 : 1 };
  const tab = (m: "login" | "register"): React.CSSProperties => ({
    flex: 1, height: 38, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700,
    background: mode === m ? "var(--p-surface)" : "transparent", color: mode === m ? "var(--p-text)" : "var(--p-muted)",
    boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,.12)" : "none",
  });

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 18, padding: 28, boxShadow: "0 10px 40px rgba(0,0,0,.12)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--p-accent)", color: "var(--p-on-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>{brandName[0]?.toUpperCase()}</div>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: "var(--p-text)", marginTop: 14 }}>{brandName}</h1>
        <p style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 4 }}>
          {mode === "login" ? "Entre com seu e-mail e senha para acessar o painel." : "Crie seu acesso ao painel com e-mail e senha."}
        </p>

        <div style={{ display: "flex", gap: 4, background: "var(--p-bg)", border: "1px solid var(--p-border)", borderRadius: 11, padding: 4, marginTop: 18 }}>
          <button onClick={() => { setMode("login"); setErr(""); }} style={tab("login")}>Entrar</button>
          <button onClick={() => { setMode("register"); setErr(""); }} style={tab("register")}>Criar conta</button>
        </div>

        {mode === "register" && (
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome (opcional)" autoComplete="name" />
        )}
        <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="seu@email.com" autoComplete="email" inputMode="email" />
        <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha (mín. 8 caracteres)" autoComplete={mode === "login" ? "current-password" : "new-password"}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />

        {err && <p style={{ fontSize: 12.5, color: "#d6453d", marginTop: 10 }}>{err}</p>}

        <button onClick={() => void submit()} disabled={busy} style={btn}>
          {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta e entrar"}
        </button>

        <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 14, textAlign: "center" }}>
          {mode === "login" ? "Ainda não tem acesso? Toque em “Criar conta”." : "Já tem conta? Toque em “Entrar”."}
        </p>
      </div>
    </div>
  );
}
