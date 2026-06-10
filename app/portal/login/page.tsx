"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BarChart2 } from "lucide-react";

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

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "linear-gradient(135deg, #080D1E 0%, #0F172A 100%)",
      }}
    >
      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: "40px 36px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(129,140,248,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(129,140,248,0.25)",
            }}
          >
            <BarChart2 size={18} color="#818CF8" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.92)", lineHeight: 1.2 }}>
              Veloce
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.2 }}>
              Portal do Cliente
            </p>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginBottom: 6 }}>
          Bem-vindo
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 28 }}>
          Acesse os resultados do seu negócio
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.87)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
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
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.87)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "#F87171", padding: "8px 12px", borderRadius: 8, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: "11px",
              borderRadius: 10,
              border: "none",
              background: loading ? "rgba(129,140,248,0.4)" : "#818CF8",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 150ms",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
        Acesso exclusivo para clientes Veloce
      </p>
    </div>
  );
}
