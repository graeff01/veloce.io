"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Respeita o tema salvo (compartilhado com o Veloce.io)
  useEffect(() => {
    const saved = localStorage.getItem("veloce-theme");
    document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";
  }, []);

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
    borderRadius: "var(--radius-input)",
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
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
      }}
    >
      <div className="portal-rise" style={{ width: "100%", maxWidth: 396 }}>
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 32, justifyContent: "center" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.5px",
              boxShadow: "0 8px 22px rgba(79,70,229,0.28)",
            }}
          >
            V
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>Veloce</p>
            <p style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Portal do Cliente
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-modal)",
            padding: "34px 32px",
            boxShadow: "var(--shadow-modal)",
          }}
        >
          <h1 style={{ fontSize: 21, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.3px" }}>
            Bem-vindo de volta
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 26, lineHeight: 1.5 }}>
            Acompanhe os resultados do seu negócio em tempo real.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                Email
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu@email.com" style={inputStyle} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                Senha
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
            </div>

            {error && (
              <p style={{ fontSize: 13, color: "var(--red)", padding: "9px 12px", borderRadius: 8, background: "var(--red-soft)", border: "1px solid var(--border)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                padding: "12px",
                borderRadius: "var(--radius-button)",
                border: "none",
                background: loading ? "rgba(79,70,229,0.5)" : "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.8 : 1,
                boxShadow: loading ? "none" : "0 8px 22px rgba(79,70,229,0.22)",
              }}
            >
              {loading ? "Entrando..." : "Acessar meu painel"}
            </button>
          </form>
        </div>

        <p style={{ marginTop: 22, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          Acesso exclusivo para clientes Veloce
        </p>
      </div>
    </div>
  );
}
