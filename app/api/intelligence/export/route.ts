import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function fmt(n: number | null | undefined, suffix = "") {
  if (n == null) return null;
  return `${n}${suffix}`;
}

function insightTypeLabel(type: string) {
  const map: Record<string, string> = {
    OBSERVATION: "OBSERVAÇÃO",
    PATTERN: "PADRÃO",
    WARNING: "AVISO",
    WINNING_STRATEGY: "ESTRATÉGIA VENCEDORA",
    HYPOTHESIS: "HIPÓTESE",
  };
  return map[type] ?? type;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const onlyStarred = searchParams.get("starred") !== "false";

  // Campanhas vencedoras ou ativas, com criativos e insights curados
  const campaigns = await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(onlyStarred ? { OR: [{ winner: true }, { status: "ACTIVE" }] } : {}),
    },
    include: {
      client: { select: { name: true, brand: true, niche: true } },
      metrics: { orderBy: { createdAt: "desc" }, take: 1 },
      creatives: {
        where: onlyStarred ? { OR: [{ winner: true }, { starred: true }] } : {},
        orderBy: [{ winner: "desc" }, { starred: "desc" }],
        take: 5,
      },
      insights: {
        where: onlyStarred ? { starred: true } : {},
        orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
        take: 10,
      },
    },
    orderBy: [{ winner: "desc" }, { updatedAt: "desc" }],
    take: 20,
  });

  const globalInsights = await prisma.globalInsight.findMany({
    where: onlyStarred ? { starred: true } : {},
    orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  const playbooks = await prisma.playbook.findMany({
    where: onlyStarred ? { starred: true } : {},
    include: { steps: { orderBy: { order: "asc" } } },
    orderBy: [{ starred: "desc" }, { updatedAt: "desc" }],
    take: 10,
  });

  // Gerar Markdown estruturado
  const lines: string[] = [];
  const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  lines.push(`# CONTEXTO OPERACIONAL — VELOCE`);
  lines.push(`> Exportado em ${now} | Uso exclusivo como contexto para IA`);
  lines.push("");

  // ── Campanhas ──────────────────────────────────────────────────────────────
  if (campaigns.length > 0) {
    lines.push("## CAMPANHAS");
    lines.push("");

    for (const c of campaigns) {
      const badge = c.winner ? "⭐ VENCEDORA" : c.status === "ACTIVE" ? "ATIVA" : c.status;
      lines.push(`### ${c.name} — ${badge}`);
      lines.push(`**Cliente:** ${c.client.brand ?? c.client.name}${c.client.niche ? ` | Nicho: ${c.client.niche}` : ""}`);
      lines.push(`**Plataforma:** ${c.platform} | **Tipo:** ${c.type} | **Objetivo:** ${c.objective}`);
      if (c.vehicle) lines.push(`**Veículo:** ${c.vehicle}`);
      if (c.budget) lines.push(`**Verba:** R$ ${c.budget.toLocaleString("pt-BR")}/mês`);

      const m = c.metrics[0];
      if (m) {
        const metricParts = [
          m.cpl != null ? `CPL: R$ ${m.cpl}` : null,
          m.ctr != null ? `CTR: ${m.ctr}%` : null,
          m.cpm != null ? `CPM: R$ ${m.cpm}` : null,
          m.leads != null ? `Leads: ${m.leads}` : null,
          m.retention != null ? `Retenção: ${m.retention}%` : null,
        ].filter(Boolean);
        if (metricParts.length > 0) {
          lines.push(`**Métricas:** ${metricParts.join(" | ")}`);
        }
      }

      if (c.result) {
        lines.push(`**Resultado:** ${c.result}`);
      }

      if (c.creatives.length > 0) {
        lines.push("");
        const winners = c.creatives.filter((cr) => cr.winner);
        const others = c.creatives.filter((cr) => !cr.winner);
        const toShow = winners.length > 0 ? winners : others.slice(0, 2);

        lines.push("**Criativos relevantes:**");
        for (const cr of toShow) {
          const badge2 = cr.winner ? "⭐" : cr.starred ? "★" : "-";
          const parts = [
            `Hook: "${cr.hook}"`,
            `Formato: ${cr.format}`,
            cr.angle ? `Ângulo: ${cr.angle}` : null,
            fmt(cr.retention, "% retenção"),
            fmt(cr.ctr, "% CTR"),
            fmt(cr.cpl) ? `CPL: R$ ${cr.cpl}` : null,
          ].filter(Boolean);
          lines.push(`${badge2} ${cr.name} — ${parts.join(" | ")}`);
          if (cr.notes) lines.push(`  _${cr.notes}_`);
        }
      }

      if (c.insights.length > 0) {
        lines.push("");
        lines.push("**Insights da campanha:**");
        for (const ins of c.insights) {
          const star = ins.starred ? "⭐ " : "";
          lines.push(`- ${star}[${insightTypeLabel(ins.type)}] ${ins.content}`);
        }
      }

      lines.push("");
    }
  }

  // ── Insights globais ───────────────────────────────────────────────────────
  if (globalInsights.length > 0) {
    lines.push("## APRENDIZADOS GLOBAIS");
    lines.push("");

    const byType = globalInsights.reduce<Record<string, typeof globalInsights>>((acc, ins) => {
      if (!acc[ins.type]) acc[ins.type] = [];
      acc[ins.type].push(ins);
      return acc;
    }, {});

    for (const [type, items] of Object.entries(byType)) {
      lines.push(`### ${insightTypeLabel(type)}`);
      for (const ins of items) {
        const star = ins.starred ? "⭐ " : "";
        const meta = [ins.niche, ins.vehicleType, ins.platform].filter(Boolean).join(" · ");
        lines.push(`- ${star}${ins.content}${meta ? ` _(${meta})_` : ""}`);
      }
      lines.push("");
    }
  }

  // ── Playbooks ──────────────────────────────────────────────────────────────
  if (playbooks.length > 0) {
    lines.push("## PLAYBOOKS");
    lines.push("");

    for (const pb of playbooks) {
      const star = pb.starred ? "⭐ " : "";
      lines.push(`### ${star}${pb.name}`);
      const meta = [pb.niche, pb.vehicleType, pb.platform, pb.objective].filter(Boolean).join(" | ");
      if (meta) lines.push(`_${meta}_`);
      lines.push(`${pb.summary}`);

      if (pb.steps.length > 0) {
        lines.push("");
        for (const step of pb.steps) {
          lines.push(`${step.order}. **${step.title}** — ${step.description}`);
          if (step.rationale) lines.push(`   > ${step.rationale}`);
        }
      }
      lines.push("");
    }
  }

  const markdown = lines.join("\n");

  // Retornar como texto ou JSON conforme solicitado
  const format = searchParams.get("format") ?? "json";
  if (format === "markdown") {
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="veloce-context-${Date.now()}.md"`,
      },
    });
  }

  return NextResponse.json({ markdown, stats: { campaigns: campaigns.length, globalInsights: globalInsights.length, playbooks: playbooks.length } });
}
