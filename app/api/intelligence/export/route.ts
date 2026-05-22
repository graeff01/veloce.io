import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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

type TemplateKey = "suv" | "hooks" | "premium" | "alta-retencao" | "meta-ads" | "google-ads" | "tiktok" | "padroes" | "custom";

interface TemplateConfig {
  label: string;
  vehicle?: string;
  platform?: string;
  niche?: string;
  onlyWinner: boolean;
  onlyHighRetention: boolean;
  focusHooks: boolean;
  focusPlaybooks: boolean;
  minRetention?: number;
}

const TEMPLATES: Record<TemplateKey, TemplateConfig> = {
  suv: { label: "Campanhas SUV", vehicle: "SUV", onlyWinner: false, onlyHighRetention: false, focusHooks: false, focusPlaybooks: false },
  hooks: { label: "Hooks vencedores", onlyWinner: true, onlyHighRetention: false, focusHooks: true, focusPlaybooks: false },
  premium: { label: "Campanhas premium", onlyWinner: true, onlyHighRetention: false, focusHooks: false, focusPlaybooks: false },
  "alta-retencao": { label: "Alta retenção", onlyWinner: false, onlyHighRetention: true, focusHooks: false, focusPlaybooks: false, minRetention: 60 },
  "meta-ads": { label: "Meta Ads", platform: "Meta Ads", onlyWinner: false, onlyHighRetention: false, focusHooks: false, focusPlaybooks: false },
  "google-ads": { label: "Google Ads", platform: "Google Ads", onlyWinner: false, onlyHighRetention: false, focusHooks: false, focusPlaybooks: false },
  tiktok: { label: "TikTok Ads", platform: "TikTok Ads", onlyWinner: false, onlyHighRetention: false, focusHooks: false, focusPlaybooks: false },
  padroes: { label: "Padrões identificados", onlyWinner: false, onlyHighRetention: false, focusHooks: false, focusPlaybooks: true },
  custom: { label: "Personalizado", onlyWinner: false, onlyHighRetention: false, focusHooks: false, focusPlaybooks: false },
};

export const EXPORT_TEMPLATES = TEMPLATES;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const onlyStarred = searchParams.get("starred") !== "false";
  const templateKey = (searchParams.get("template") ?? "custom") as TemplateKey;
  const tmpl = TEMPLATES[templateKey] ?? TEMPLATES.custom;

  const vehicle = tmpl.vehicle ?? searchParams.get("vehicle") ?? "";
  const platform = tmpl.platform ?? searchParams.get("platform") ?? "";
  const niche = tmpl.niche ?? searchParams.get("niche") ?? "";

  function campaignWhere(): Prisma.CampaignWhereInput {
    const base: Prisma.CampaignWhereInput = {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(vehicle ? { vehicle: { contains: vehicle, mode: "insensitive" } } : {}),
      ...(platform ? { platform: { contains: platform, mode: "insensitive" } } : {}),
      ...(niche ? { client: { niche: { contains: niche, mode: "insensitive" } } } : {}),
    };
    if (tmpl.onlyWinner) {
      return { ...base, winner: true };
    }
    if (onlyStarred) {
      return { ...base, OR: [{ winner: true }, { status: "ACTIVE" }] };
    }
    return base;
  }

  function creativeWhere(): Prisma.CreativeWhereInput {
    const base: Prisma.CreativeWhereInput = {
      ...(vehicle ? { vehicleType: { contains: vehicle, mode: "insensitive" } } : {}),
      ...(platform ? { platform: { contains: platform, mode: "insensitive" } } : {}),
      ...(niche ? { niche: { contains: niche, mode: "insensitive" } } : {}),
      ...(tmpl.onlyHighRetention && tmpl.minRetention ? { retention: { gte: tmpl.minRetention } } : {}),
    };
    if (tmpl.onlyWinner || tmpl.focusHooks) return { ...base, winner: true };
    if (onlyStarred) return { ...base, OR: [{ winner: true }, { starred: true }] };
    return base;
  }

  function insightWhere(): Prisma.GlobalInsightWhereInput {
    return {
      ...(onlyStarred ? { starred: true } : {}),
      ...(vehicle ? { vehicleType: { contains: vehicle, mode: "insensitive" } } : {}),
      ...(platform ? { platform: { contains: platform, mode: "insensitive" } } : {}),
      ...(niche ? { niche: { contains: niche, mode: "insensitive" } } : {}),
    };
  }

  // For hooks template: fetch all winner creatives with campaign included
  let hooksCreatives: Array<{
    id: string; hook: string; format: string; angle?: string | null;
    niche?: string | null; vehicleType?: string | null; platform?: string | null;
    retention?: number | null; ctr?: number | null; notes?: string | null;
    campaign?: { name: string; client: { name: string } } | null;
  }> = [];

  if (tmpl.focusHooks) {
    hooksCreatives = await prisma.creative.findMany({
      where: { ...creativeWhere(), hook: { not: "" } },
      include: { campaign: { select: { name: true, client: { select: { name: true } } } } },
      orderBy: [{ winner: "desc" }, { starred: "desc" }, { retention: "desc" }],
      take: 30,
    });
  }

  const [campaigns, standaloneCreatives, globalInsights, playbooks] = await Promise.all([
    tmpl.focusHooks
      ? Promise.resolve([] as Awaited<ReturnType<typeof prisma.campaign.findMany<{ include: { client: true; metrics: true; creatives: true; insights: true } }>>>)
      : prisma.campaign.findMany({
          where: campaignWhere(),
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
        }),

    prisma.creative.findMany({
      where: { ...creativeWhere(), campaignId: null },
      orderBy: [{ winner: "desc" }, { starred: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),

    prisma.globalInsight.findMany({
      where: insightWhere(),
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),

    prisma.playbook.findMany({
      where: onlyStarred || tmpl.focusPlaybooks ? { starred: true } : {},
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: [{ starred: "desc" }, { updatedAt: "desc" }],
      take: 10,
    }),
  ]);

  // Generate Markdown
  const lines: string[] = [];
  const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  lines.push(`# CONTEXTO OPERACIONAL — VELOCE`);
  lines.push(`> Exportado em ${now} | Template: ${tmpl.label} | Uso exclusivo como contexto para IA`);
  lines.push("");

  if (tmpl.focusHooks) {
    lines.push("## HOOKS VENCEDORES");
    lines.push("");

    for (const cr of hooksCreatives) {
      const metrics = [
        cr.retention != null ? `${cr.retention}% retenção` : null,
        cr.ctr != null ? `${cr.ctr}% CTR` : null,
      ].filter(Boolean);

      lines.push(`⭐ "${cr.hook}"`);
      const meta = [cr.format, cr.angle, cr.niche, cr.vehicleType, cr.platform].filter(Boolean).join(" · ");
      if (meta) lines.push(`   _${meta}_`);
      if (metrics.length > 0) lines.push(`   ${metrics.join(" | ")}`);
      if (cr.notes) lines.push(`   ${cr.notes}`);
      if (cr.campaign) lines.push(`   Campanha: ${cr.campaign.client.name} — ${cr.campaign.name}`);
      lines.push("");
    }

    if (hooksCreatives.length === 0) {
      lines.push("_Nenhum hook vencedor registrado ainda._");
      lines.push("");
    }
  } else {
    // Campanhas
    if (campaigns.length > 0) {
      lines.push("## CAMPANHAS");
      lines.push("");

      for (const c of campaigns) {
        const badge = c.winner ? "⭐ VENCEDORA" : c.status === "ACTIVE" ? "ATIVA" : c.status;
        lines.push(`### ${c.name} — ${badge}`);
        lines.push(`**Cliente:** ${c.client.brand ?? c.client.name}${c.client.niche ? ` | Nicho: ${c.client.niche}` : ""}`);
        lines.push(`**Plataforma:** ${c.platform} | **Tipo:** ${c.type} | **Objetivo:** ${c.objective}`);
        if (c.vehicle) lines.push(`**Veículo:** ${c.vehicle}`);

        const m = c.metrics[0];
        if (m) {
          const metricParts = [
            m.cpl != null ? `CPL: R$ ${m.cpl}` : null,
            m.ctr != null ? `CTR: ${m.ctr}%` : null,
            m.cpm != null ? `CPM: R$ ${m.cpm}` : null,
            m.leads != null ? `Leads: ${m.leads}` : null,
            m.retention != null ? `Retenção: ${m.retention}%` : null,
          ].filter(Boolean);
          if (metricParts.length > 0) lines.push(`**Métricas:** ${metricParts.join(" | ")}`);
        }

        if (c.result) lines.push(`**Resultado:** ${c.result}`);

        if (c.creatives.length > 0) {
          lines.push("");
          const toShow = c.creatives.filter((cr) => cr.winner).length > 0
            ? c.creatives.filter((cr) => cr.winner)
            : c.creatives.slice(0, 2);

          lines.push("**Criativos relevantes:**");
          for (const cr of toShow) {
            const badge2 = cr.winner ? "⭐" : cr.starred ? "★" : "-";
            const parts = [
              `Hook: "${cr.hook}"`,
              `Formato: ${cr.format}`,
              cr.angle ? `Ângulo: ${cr.angle}` : null,
              fmt(cr.retention, "% retenção"),
              fmt(cr.ctr, "% CTR"),
              cr.cpl != null ? `CPL: R$ ${cr.cpl}` : null,
            ].filter(Boolean);
            lines.push(`${badge2} ${cr.name} — ${parts.join(" | ")}`);
            if (cr.notes) lines.push(`  _${cr.notes}_`);
          }
        }

        if (c.insights.length > 0) {
          lines.push("");
          lines.push("**Insights da campanha:**");
          for (const ins of c.insights) {
            lines.push(`- ${ins.starred ? "⭐ " : ""}[${insightTypeLabel(ins.type)}] ${ins.content}`);
          }
        }

        lines.push("");
      }
    }

    // Criativos standalone
    if (standaloneCreatives.length > 0) {
      lines.push("## CRIATIVOS / HOOKS INDEPENDENTES");
      lines.push("");
      for (const cr of standaloneCreatives) {
        const badge = cr.winner ? "⭐" : cr.starred ? "★" : "-";
        const meta = [cr.format, cr.angle, cr.niche, cr.vehicleType, cr.platform].filter(Boolean).join(" · ");
        const metrics = [
          cr.retention != null ? `${cr.retention}% retenção` : null,
          cr.ctr != null ? `${cr.ctr}% CTR` : null,
          cr.cpl != null ? `CPL R$ ${cr.cpl}` : null,
        ].filter(Boolean);
        lines.push(`${badge} "${cr.hook}"${meta ? ` — _${meta}_` : ""}`);
        if (metrics.length > 0) lines.push(`   ${metrics.join(" | ")}`);
        if (cr.notes) lines.push(`   ${cr.notes}`);
        lines.push("");
      }
    }
  }

  // Insights globais
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
        const meta = [ins.niche, ins.vehicleType, ins.platform].filter(Boolean).join(" · ");
        lines.push(`- ${ins.starred ? "⭐ " : ""}${ins.content}${meta ? ` _(${meta})_` : ""}`);
      }
      lines.push("");
    }
  }

  // Playbooks
  if (playbooks.length > 0) {
    lines.push("## PLAYBOOKS");
    lines.push("");

    for (const pb of playbooks) {
      lines.push(`### ${pb.starred ? "⭐ " : ""}${pb.name}`);
      const meta = [pb.niche, pb.vehicleType, pb.platform, pb.objective].filter(Boolean).join(" | ");
      if (meta) lines.push(`_${meta}_`);
      lines.push(pb.summary);

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
  const format = searchParams.get("format") ?? "json";

  if (format === "markdown") {
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="veloce-${templateKey}-${Date.now()}.md"`,
      },
    });
  }

  return NextResponse.json({
    markdown,
    template: tmpl.label,
    stats: {
      campaigns: campaigns.length,
      standaloneCreatives: standaloneCreatives.length,
      globalInsights: globalInsights.length,
      playbooks: playbooks.length,
    },
  });
}
