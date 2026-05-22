"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Megaphone, Image, Lightbulb, BookOpen,
  Download, Star, TrendingUp, Brain,
} from "lucide-react";

interface HubStats {
  campaigns: number;
  creatives: number;
  insights: number;
  playbooks: number;
  winners: number;
  starred: number;
}

const sections = [
  {
    href: "/intelligence/campaigns",
    icon: Megaphone,
    label: "Campanhas",
    desc: "Registre, analise e identifique padrões de campanhas.",
    color: "#7C3AED",
    stat: "campaigns",
  },
  {
    href: "/intelligence/creatives",
    icon: Image,
    label: "Criativos",
    desc: "Biblioteca de hooks, formatos e ângulos vencedores.",
    color: "#3B82F6",
    stat: "creatives",
  },
  {
    href: "/intelligence/insights",
    icon: Lightbulb,
    label: "Insights",
    desc: "Aprendizados reais, padrões e observações estratégicas.",
    color: "#F59E0B",
    stat: "insights",
  },
  {
    href: "/intelligence/playbooks",
    icon: BookOpen,
    label: "Playbooks",
    desc: "Estratégias estruturadas por nicho, veículo e plataforma.",
    color: "#10B981",
    stat: "playbooks",
  },
  {
    href: "/intelligence/export",
    icon: Download,
    label: "Exportar para IA",
    desc: "Gere contexto limpo e estruturado para alimentar o Claude.",
    color: "#EC4899",
    stat: null,
  },
];

export function IntelligenceHub() {
  const [stats, setStats] = useState<HubStats | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => r.ok ? r.json() : []),
      fetch("/api/creatives").then((r) => r.ok ? r.json() : []),
      fetch("/api/insights").then((r) => r.ok ? r.json() : { global: [], campaign: [] }),
      fetch("/api/playbooks").then((r) => r.ok ? r.json() : []),
    ]).then(([campaigns, creatives, insights, playbooks]) => {
      const allCampaigns = Array.isArray(campaigns) ? campaigns : [];
      const allCreatives = Array.isArray(creatives) ? creatives : [];
      const allInsights = [
        ...(insights.global ?? []),
        ...(insights.campaign ?? []),
      ];
      const allPlaybooks = Array.isArray(playbooks) ? playbooks : [];

      setStats({
        campaigns: allCampaigns.length,
        creatives: allCreatives.length,
        insights: allInsights.length,
        playbooks: allPlaybooks.length,
        winners: allCreatives.filter((c: { winner: boolean }) => c.winner).length,
        starred: allInsights.filter((i: { starred: boolean }) => i.starred).length,
      });
    }).catch(() => {});
  }, []);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "32px 40px",
        background: "var(--bg-base)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #7C3AED, #3B82F6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Brain size={18} color="#fff" />
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Inteligência Operacional
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 480 }}>
          Base de conhecimento estratégico da Veloce — campanhas, criativos, aprendizados e playbooks organizados para alimentar IA.
        </p>
      </div>

      {/* Stats rápidos */}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <StatCard label="Total de campanhas" value={stats.campaigns} icon={Megaphone} color="#7C3AED" />
          <StatCard label="Criativos vencedores" value={stats.winners} icon={Star} color="#F59E0B" />
          <StatCard label="Insights estrelados" value={stats.starred} icon={TrendingUp} color="#10B981" />
        </div>
      )}

      {/* Cards das seções */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
        }}
      >
        {sections.map((s) => {
          const Icon = s.icon;
          const count = stats && s.stat ? stats[s.stat as keyof HubStats] : null;

          return (
            <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "20px 22px",
                  background: "var(--bg-surface)",
                  cursor: "pointer",
                  transition: "border-color 180ms, transform 180ms, box-shadow 180ms",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = s.color;
                  el.style.transform = "translateY(-2px)";
                  el.style.boxShadow = `0 8px 24px ${s.color}22`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "var(--border)";
                  el.style.transform = "translateY(0)";
                  el.style.boxShadow = "none";
                }}
              >
                {/* Accent bar */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: 3,
                    background: s.color,
                    borderRadius: "12px 12px 0 0",
                  }}
                />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: `${s.color}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                    }}
                  >
                    <Icon size={18} color={s.color} />
                  </div>
                  {count !== null && (
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: s.color,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 5,
                  }}
                >
                  {s.label}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {s.desc}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
        background: "var(--bg-surface)",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: `${color}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} color={color} />
      </div>
      <div>
        <p style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{label}</p>
      </div>
    </div>
  );
}
