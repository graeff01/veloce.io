"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Copy, Check, FileText, Brain, Filter } from "lucide-react";

interface Client { id: string; name: string; brand?: string | null }
interface ExportStats { campaigns: number; globalInsights: number; playbooks: number }

export function ExportPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [onlyStarred, setOnlyStarred] = useState(true);
  const [markdown, setMarkdown] = useState("");
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function handleGenerate() {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedClient) params.set("clientId", selectedClient);
    params.set("starred", String(onlyStarred));

    const res = await fetch(`/api/intelligence/export?${params}`);
    if (res.ok) {
      const data = await res.json();
      setMarkdown(data.markdown);
      setStats(data.stats);
    }
    setLoading(false);
  }

  async function handleDownload() {
    const params = new URLSearchParams();
    if (selectedClient) params.set("clientId", selectedClient);
    params.set("starred", String(onlyStarred));
    params.set("format", "markdown");
    window.open(`/api/intelligence/export?${params}`, "_blank");
  }

  async function handleCopy() {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const charCount = markdown.length;
  const estimatedTokens = Math.round(charCount / 4);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Link href="/intelligence" style={{ color: "var(--text-muted)", display: "flex" }}>
          <ChevronLeft size={18} />
        </Link>
        <Download size={18} color="#EC4899" />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          Exportar para IA
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* Painel de configuração */}
        <div
          style={{
            border: "1px solid var(--border)", borderRadius: 12,
            background: "var(--bg-surface)", padding: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <Filter size={14} color="var(--text-muted)" />
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Configurar exportação</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Cliente (opcional)
              </label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                style={{
                  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                  background: "var(--bg-base)", color: "var(--text-primary)",
                  padding: "8px 10px", fontSize: 13, outline: "none",
                }}
              >
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.brand ?? c.name}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Deixe em branco para exportar toda a base
              </p>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                Filtro de qualidade
              </label>
              <button
                onClick={() => setOnlyStarred((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  border: `1px solid ${onlyStarred ? "var(--accent)" : "var(--border)"}`,
                  background: onlyStarred ? "var(--accent-soft)" : "var(--bg-base)",
                  borderRadius: 8, padding: "10px 12px",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `2px solid ${onlyStarred ? "var(--accent)" : "var(--border)"}`,
                    background: onlyStarred ? "var(--accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {onlyStarred && <Check size={10} color="#fff" />}
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>Apenas curados</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    ⭐ Vencedores, estrelados e campanhas ativas
                  </p>
                </div>
              </button>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                Recomendado. Exporta apenas o que foi marcado como relevante, evitando poluição de contexto.
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "var(--accent)", color: "#fff", border: "none",
                borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 500,
                cursor: "pointer", boxShadow: "0 4px 14px rgba(124,58,237,0.25)",
                opacity: loading ? 0.7 : 1,
              }}
            >
              <Brain size={15} />
              {loading ? "Gerando..." : "Gerar contexto"}
            </button>
          </div>

          {/* Como usar */}
          <div
            style={{
              marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Como usar
            </p>
            <ol style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {["Configure os filtros acima", "Gere o contexto", "Copie o Markdown", "Cole no início do chat com o Claude", "Peça para criar campanhas, analisar métricas ou gerar estratégias"].map((s, i) => (
                <li key={i} style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{s}</li>
              ))}
            </ol>
          </div>
        </div>

        {/* Preview do Markdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {markdown ? (
            <>
              {/* Stats bar */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  border: "1px solid var(--border)", borderRadius: 10,
                  background: "var(--bg-surface)", padding: "10px 16px",
                }}
              >
                <div style={{ display: "flex", gap: 20, flex: 1 }}>
                  {stats && (
                    <>
                      <StatPill label="Campanhas" value={stats.campaigns} />
                      <StatPill label="Insights globais" value={stats.globalInsights} />
                      <StatPill label="Playbooks" value={stats.playbooks} />
                    </>
                  )}
                  <StatPill label="~Tokens" value={estimatedTokens.toLocaleString("pt-BR")} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleCopy}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      border: "1px solid var(--border)", borderRadius: 7,
                      background: copied ? "#10B98118" : "var(--bg-base)",
                      color: copied ? "#10B981" : "var(--text-secondary)",
                      padding: "6px 12px", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                  <button
                    onClick={handleDownload}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      border: "1px solid var(--border)", borderRadius: 7,
                      background: "var(--bg-base)", color: "var(--text-secondary)",
                      padding: "6px 12px", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    <FileText size={12} /> .md
                  </button>
                </div>
              </div>

              {/* Markdown preview */}
              <div
                style={{
                  border: "1px solid var(--border)", borderRadius: 12,
                  background: "var(--bg-surface)", padding: "20px 22px",
                  fontFamily: "monospace", fontSize: 12, lineHeight: 1.7,
                  color: "var(--text-primary)", whiteSpace: "pre-wrap",
                  maxHeight: "calc(100vh - 260px)", overflowY: "auto",
                  wordBreak: "break-word",
                }}
              >
                {markdown}
              </div>
            </>
          ) : (
            <div
              style={{
                border: "1px dashed var(--border)", borderRadius: 12,
                padding: "80px 40px", textAlign: "center",
              }}
            >
              <Brain size={36} color="var(--text-muted)" style={{ margin: "0 auto 16px" }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                Contexto ainda não gerado
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360, margin: "0 auto", lineHeight: 1.6 }}>
                Configure os filtros no painel ao lado e clique em "Gerar contexto" para criar o Markdown estruturado pronto para o Claude.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
