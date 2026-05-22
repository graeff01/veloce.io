"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Copy, Check, FileText, Brain, Zap, Trophy, TrendingUp } from "lucide-react";

interface ExportStats {
  campaigns: number;
  standaloneCreatives: number;
  globalInsights: number;
  playbooks: number;
}

type TemplateKey = "suv" | "hooks" | "premium" | "alta-retencao" | "meta-ads" | "google-ads" | "tiktok" | "padroes" | "custom";

interface Template {
  key: TemplateKey;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
}

const TEMPLATES: Template[] = [
  { key: "suv", label: "Campanhas SUV", desc: "Todos os padrões com veículo SUV", icon: Trophy, color: "#7C3AED" },
  { key: "hooks", label: "Hooks vencedores", desc: "Apenas hooks marcados como winner", icon: Zap, color: "#F59E0B" },
  { key: "premium", label: "Campanhas premium", desc: "Campanhas vencedoras curadas", icon: Trophy, color: "#10B981" },
  { key: "alta-retencao", label: "Alta retenção", desc: "Criativos com ≥60% de retenção", icon: TrendingUp, color: "#3B82F6" },
  { key: "meta-ads", label: "Meta Ads", desc: "Tudo do Meta Ads", icon: Brain, color: "#1877F2" },
  { key: "google-ads", label: "Google Ads", desc: "Tudo do Google Ads", icon: Brain, color: "#EA4335" },
  { key: "tiktok", label: "TikTok Ads", desc: "Tudo do TikTok Ads", icon: Brain, color: "#000000" },
  { key: "padroes", label: "Padrões identificados", desc: "Playbooks e insights starred", icon: Brain, color: "#8B5CF6" },
  { key: "custom", label: "Personalizado", desc: "Configure manualmente os filtros", icon: Brain, color: "#6B7280" },
];

export function ExportPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>("custom");
  const [selectedClient, setSelectedClient] = useState("");
  const [onlyStarred, setOnlyStarred] = useState(true);
  const [markdown, setMarkdown] = useState("");
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [templateLabel, setTemplateLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("template", selectedTemplate);
    if (selectedClient) params.set("clientId", selectedClient);
    if (selectedTemplate === "custom") params.set("starred", String(onlyStarred));

    const res = await fetch(`/api/intelligence/export?${params}`);
    if (res.ok) {
      const data = await res.json();
      setMarkdown(data.markdown);
      setStats(data.stats);
      setTemplateLabel(data.template ?? "");
    }
    setLoading(false);
  }

  async function handleDownload() {
    const params = new URLSearchParams();
    params.set("template", selectedTemplate);
    if (selectedClient) params.set("clientId", selectedClient);
    if (selectedTemplate === "custom") params.set("starred", String(onlyStarred));
    params.set("format", "markdown");
    window.open(`/api/intelligence/export?${params}`, "_blank");
  }

  async function handleCopy() {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const estimatedTokens = Math.round(markdown.length / 4);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <Link href="/intelligence" style={{ color: "var(--text-muted)", display: "flex" }}>
          <ChevronLeft size={18} />
        </Link>
        <Brain size={18} color="#7C3AED" />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          Exportar para IA
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>
        {/* Painel esquerdo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Templates */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg-surface)" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Template de exportação</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Selecione o contexto que será enviado ao Claude</p>
            </div>
            <div style={{ padding: "8px" }}>
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const active = selectedTemplate === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setSelectedTemplate(t.key)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 10px", borderRadius: 8, cursor: "pointer",
                      border: active ? `1px solid ${t.color}44` : "1px solid transparent",
                      background: active ? `${t.color}0e` : "transparent",
                      textAlign: "left", transition: "all 120ms",
                    }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                      background: `${t.color}18`, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={13} color={t.color} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {t.label}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.desc}</p>
                    </div>
                    {active && (
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: t.color, flexShrink: 0,
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtros custom (só visível quando custom selecionado) */}
          {selectedTemplate === "custom" && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-surface)", padding: "14px 16px" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Filtros</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                    Qualidade
                  </label>
                  <button
                    onClick={() => setOnlyStarred((v) => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      border: `1px solid ${onlyStarred ? "var(--accent)" : "var(--border)"}`,
                      background: onlyStarred ? "var(--accent-soft)" : "var(--bg-base)",
                      borderRadius: 7, padding: "8px 10px", cursor: "pointer", width: "100%",
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${onlyStarred ? "var(--accent)" : "var(--border)"}`,
                      background: onlyStarred ? "var(--accent)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {onlyStarred && <Check size={9} color="#fff" />}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-primary)" }}>Apenas curados (⭐ / vencedores)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Gerar */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
              opacity: loading ? 0.7 : 1, transition: "opacity 150ms",
            }}
          >
            <Brain size={15} />
            {loading ? "Gerando contexto..." : "Gerar contexto"}
          </button>

          {/* Instrução de uso */}
          <div style={{
            border: "1px solid var(--border)", borderRadius: 12,
            background: "var(--bg-surface)", padding: "14px 16px",
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Como usar
            </p>
            {[
              "Selecione o template que corresponde à nova campanha",
              "Gere o contexto e copie o Markdown",
              "Cole no início do chat com o Claude",
              "Peça: \"Crie uma campanha para Compass baseada nesses padrões vencedores\"",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{i + 1}.</span>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Área de preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {markdown ? (
            <>
              {/* Stats bar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                border: "1px solid var(--border)", borderRadius: 10,
                background: "var(--bg-surface)", padding: "10px 16px",
              }}>
                <div style={{ display: "flex", gap: 20, flex: 1 }}>
                  {templateLabel && (
                    <div>
                      <p style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Template</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{templateLabel}</p>
                    </div>
                  )}
                  {stats && (
                    <>
                      {stats.campaigns > 0 && <StatPill label="Campanhas" value={stats.campaigns} />}
                      {stats.standaloneCreatives > 0 && <StatPill label="Criativos" value={stats.standaloneCreatives} />}
                      {stats.globalInsights > 0 && <StatPill label="Insights" value={stats.globalInsights} />}
                      {stats.playbooks > 0 && <StatPill label="Playbooks" value={stats.playbooks} />}
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

              {/* Markdown */}
              <div style={{
                border: "1px solid var(--border)", borderRadius: 12,
                background: "var(--bg-surface)", padding: "20px 22px",
                fontFamily: "monospace", fontSize: 12, lineHeight: 1.7,
                color: "var(--text-primary)", whiteSpace: "pre-wrap",
                maxHeight: "calc(100vh - 260px)", overflowY: "auto",
                wordBreak: "break-word",
              }}>
                {markdown}
              </div>
            </>
          ) : (
            <div style={{
              border: "1px dashed var(--border)", borderRadius: 12,
              padding: "80px 40px", textAlign: "center",
              minHeight: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <Brain size={36} color="var(--text-muted)" style={{ marginBottom: 16 }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                Contexto não gerado
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.6 }}>
                Selecione um template no painel à esquerda e clique em "Gerar contexto" para criar o Markdown estruturado pronto para o Claude.
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
      <p style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
