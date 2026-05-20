"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Zap, Mail, Lock, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Email ou senha inválidos.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
        fontFamily: "'Inter', system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle grid background */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          opacity: 0.45,
          pointerEvents: "none",
        }}
      />

      {/* Centered card */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          margin: "0 24px",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 32,
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(124,58,237,0.3)",
            }}
          >
            <Zap size={20} color="white" fill="white" />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              veloce<span style={{ color: "var(--accent)" }}>.io</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: "18px" }}>
              Acesso interno — equipe autorizada
            </p>
          </div>
        </div>

        {/* Form card */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "32px 32px 28px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 24,
            }}
          >
            Entrar na plataforma
          </h2>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Email field */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="email"
                style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
              >
                Email
              </label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={14}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@veloce.io"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 36px",
                    fontSize: 14,
                    lineHeight: "20px",
                    borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    outline: "none",
                    transition: "border-color 150ms ease-out, box-shadow 150ms ease-out",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--accent)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border-strong)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="password"
                style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
              >
                Senha
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={14}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 36px",
                    fontSize: 14,
                    lineHeight: "20px",
                    borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    outline: "none",
                    transition: "border-color 150ms ease-out, box-shadow 150ms ease-out",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--accent)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border-strong)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--red-soft)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  fontSize: 13,
                  color: "var(--red)",
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--red)",
                    flexShrink: 0,
                  }}
                />
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "11px 16px",
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 500,
                color: "white",
                background: loading ? "var(--accent-mid)" : "var(--accent)",
                border: "none",
                borderRadius: 8,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 150ms ease-out, transform 150ms ease-out, box-shadow 150ms ease-out",
                boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#6d28d9";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(124,58,237,0.35)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(124,58,237,0.25)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                }
              }}
            >
              {loading ? (
                "Entrando..."
              ) : (
                <>
                  Entrar <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "var(--text-muted)",
            marginTop: 20,
          }}
        >
          Plataforma restrita à equipe interna
        </p>
      </div>
    </div>
  );
}
