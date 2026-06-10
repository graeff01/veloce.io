"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/portal/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Erro ao fazer login");
        return;
      }

      router.replace("/portal");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 150ms, box-shadow 150ms",
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        position: "relative",
      }}
    >
      <div className="portal-rise" style={{ width: "100%", maxWidth: 400 }}>
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 36, justifyContent: "center" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6366F1 0%, #818CF8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.5px",
              boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
            }}
          >
            V
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.3px" }}>
              Veloce
            </p>
            <p style={{ fontSize: 10.5, fontWeight: 500, color: "rgba(255,255,255,0.4)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Centro de Performance
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 18,
            padding: "36px 34px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.45)",
          }}
        >
          <h1 style={{ fontSize: 21, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 6, letterSpacing: "-0.3px" }}>
            Bem-vindo de volta
          </h1>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.45)", marginBottom: 28, lineHeight: 1.5 }}>
            Acompanhe os resultados do seu negócio em tempo real.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {error && (
              <p style={{ fontSize: 13, color: "#F87171", padding: "9px 12px", borderRadius: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: loading
                  ? "rgba(99,102,241,0.4)"
                  : "linear-gradient(135deg, #6366F1 0%, #818CF8 100%)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "opacity 150ms, transform 150ms",
                opacity: loading ? 0.7 : 1,
                boxShadow: loading ? "none" : "0 8px 24px rgba(99,102,241,0.25)",
              }}
            >
              {loading ? "Entrando..." : "Acessar meu painel"}
            </button>
          </form>
        </div>

        <p style={{ marginTop: 24, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
          Acesso exclusivo para clientes Veloce
        </p>
      </div>
    </div>
  );
}
