"use client";

import { useState } from "react";

// Tela de login do painel (OTP por e-mail). Usa as vars de tema do portal (--p-*).
export function PortalGate({ token, brandName }: { token: string; brandName: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function requestCode() {
    if (!email.includes("@")) { setErr("Digite um e-mail válido."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/portal/${token}/auth/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Erro ao enviar o código."); return; }
    setStep("code");
  }
  async function verify() {
    if (code.trim().length < 4) { setErr("Digite o código."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/portal/${token}/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Código inválido."); return; }
    window.location.reload(); // sessão criada → servidor renderiza o painel
  }

  const field: React.CSSProperties = { width: "100%", height: 44, borderRadius: 11, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", padding: "0 14px", fontSize: 15, boxSizing: "border-box" };
  const btn: React.CSSProperties = { width: "100%", height: 44, borderRadius: 11, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12, opacity: busy ? 0.6 : 1 };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 18, padding: 28, boxShadow: "0 10px 40px rgba(0,0,0,.12)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--p-accent)", color: "var(--p-on-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>{brandName[0]?.toUpperCase()}</div>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: "var(--p-text)", marginTop: 14 }}>{brandName}</h1>
        <p style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 4 }}>
          {step === "email" ? "Acesse o painel de performance. Vamos enviar um código de acesso para o seu e-mail." : `Enviamos um código de 6 dígitos para ${email}.`}
        </p>

        <div style={{ marginTop: 18 }}>
          {step === "email" ? (
            <>
              <input style={field} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="seu@email.com" onKeyDown={(e) => { if (e.key === "Enter") requestCode(); }} />
              <button style={btn} onClick={requestCode} disabled={busy}>{busy ? "Enviando…" : "Receber código"}</button>
            </>
          ) : (
            <>
              <input style={{ ...field, letterSpacing: 8, textAlign: "center", fontSize: 22, fontWeight: 700 }} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="------" onKeyDown={(e) => { if (e.key === "Enter") verify(); }} autoFocus />
              <button style={btn} onClick={verify} disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
              <button onClick={() => { setStep("email"); setCode(""); setErr(""); }} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "var(--p-muted)", fontSize: 12.5, cursor: "pointer" }}>← Usar outro e-mail</button>
            </>
          )}
          {err && <p style={{ fontSize: 12.5, color: "#d6453d", marginTop: 10 }}>{err}</p>}
        </div>
      </div>
    </div>
  );
}
