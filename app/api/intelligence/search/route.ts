import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const niche = searchParams.get("niche") ?? "";
  const vehicle = searchParams.get("vehicle") ?? "";
  const platform = searchParams.get("platform") ?? "";
  const winnersOnly = searchParams.get("winners") === "true";

  if (!q && !niche && !vehicle && !platform && !winnersOnly) {
    return NextResponse.json({ campaigns: [], creatives: [], insights: [], playbooks: [] });
  }

  // Build reusable AND filters
  function vehicleFilter(field: string = "vehicleType") {
    return vehicle ? { [field]: { contains: vehicle, mode: "insensitive" as const } } : null;
  }
  function platformFilter(field: string = "platform") {
    return platform ? { [field]: { contains: platform, mode: "insensitive" as const } } : null;
  }
  function nicheFilter(field: string = "niche") {
    return niche ? { [field]: { contains: niche, mode: "insensitive" as const } } : null;
  }

  const campaigns = await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      ...(winnersOnly ? { winner: true } : {}),
      ...(vehicle ? { vehicle: { contains: vehicle, mode: "insensitive" } } : {}),
      ...(platform ? { platform: { contains: platform, mode: "insensitive" } } : {}),
      ...(niche ? { client: { niche: { contains: niche, mode: "insensitive" } } } : {}),
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { vehicle: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
          { result: { contains: q, mode: "insensitive" } },
          { objective: { contains: q, mode: "insensitive" } },
        ] as Prisma.CampaignWhereInput[],
      } : {}),
    },
    include: {
      client: { select: { id: true, name: true, brand: true, niche: true } },
      metrics: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { creatives: true } },
    },
    orderBy: [{ winner: "desc" }, { updatedAt: "desc" }],
    take: 12,
  });

  const creatives = await prisma.creative.findMany({
    where: {
      ...(winnersOnly ? { winner: true } : {}),
      ...((vehicleFilter() ?? {}) as object),
      ...((platformFilter() ?? {}) as object),
      ...((nicheFilter() ?? {}) as object),
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { hook: { contains: q, mode: "insensitive" } },
          { angle: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
          { niche: { contains: q, mode: "insensitive" } },
          { vehicleType: { contains: q, mode: "insensitive" } },
        ] as Prisma.CreativeWhereInput[],
      } : {}),
    },
    include: {
      campaign: {
        select: { id: true, name: true, client: { select: { name: true } } },
      },
    },
    orderBy: [{ winner: "desc" }, { starred: "desc" }, { createdAt: "desc" }],
    take: 15,
  });

  const campaignInsights = await prisma.campaignInsight.findMany({
    where: {
      ...(winnersOnly ? { starred: true } : {}),
      ...(vehicle ? { vehicleType: { contains: vehicle, mode: "insensitive" } } : {}),
      ...(platform ? { platform: { contains: platform, mode: "insensitive" } } : {}),
      ...(niche ? { niche: { contains: niche, mode: "insensitive" } } : {}),
      ...(q ? {
        OR: [
          { content: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
          { niche: { contains: q, mode: "insensitive" } },
          { vehicleType: { contains: q, mode: "insensitive" } },
        ] as Prisma.CampaignInsightWhereInput[],
      } : {}),
    },
    include: {
      campaign: {
        select: { id: true, name: true, client: { select: { name: true } } },
      },
    },
    orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
    take: 10,
  });

  const globalInsights = await prisma.globalInsight.findMany({
    where: {
      ...(winnersOnly ? { starred: true } : {}),
      ...(vehicle ? { vehicleType: { contains: vehicle, mode: "insensitive" } } : {}),
      ...(platform ? { platform: { contains: platform, mode: "insensitive" } } : {}),
      ...(niche ? { niche: { contains: niche, mode: "insensitive" } } : {}),
      ...(q ? {
        OR: [
          { content: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
          { niche: { contains: q, mode: "insensitive" } },
          { vehicleType: { contains: q, mode: "insensitive" } },
        ] as Prisma.GlobalInsightWhereInput[],
      } : {}),
    },
    orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
    take: 10,
  });

  const playbooks = await prisma.playbook.findMany({
    where: {
      ...(winnersOnly ? { starred: true } : {}),
      ...(vehicle ? { vehicleType: { contains: vehicle, mode: "insensitive" } } : {}),
      ...(platform ? { platform: { contains: platform, mode: "insensitive" } } : {}),
      ...(niche ? { niche: { contains: niche, mode: "insensitive" } } : {}),
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
          { niche: { contains: q, mode: "insensitive" } },
          { vehicleType: { contains: q, mode: "insensitive" } },
        ] as Prisma.PlaybookWhereInput[],
      } : {}),
    },
    include: { steps: { orderBy: { order: "asc" }, take: 3 } },
    orderBy: [{ starred: "desc" }, { updatedAt: "desc" }],
    take: 6,
  });

  const allInsights = [
    ...campaignInsights.map((i) => ({ ...i, _scope: "campaign" as const })),
    ...globalInsights.map((i) => ({ ...i, _scope: "global" as const, campaign: null })),
  ].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return NextResponse.json({
    campaigns,
    creatives,
    insights: allInsights,
    playbooks,
    total: campaigns.length + creatives.length + allInsights.length + playbooks.length,
  });
}
