import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patternSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hook"),
    hook: z.string().min(1),
    format: z.string().min(1),
    angle: z.string().optional(),
    niche: z.string().optional(),
    vehicleType: z.string().optional(),
    platform: z.string().optional(),
    retention: z.number().optional(),
    ctr: z.number().optional(),
    cpl: z.number().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    campaignId: z.string().optional(),
    winner: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("creative"),
    name: z.string().min(1),
    hook: z.string().min(1),
    format: z.string().min(1),
    angle: z.string().optional(),
    style: z.string().optional(),
    niche: z.string().optional(),
    vehicleType: z.string().optional(),
    platform: z.string().optional(),
    retention: z.number().optional(),
    ctr: z.number().optional(),
    cpl: z.number().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    campaignId: z.string().optional(),
    winner: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("insight"),
    content: z.string().min(1),
    type: z.enum(["OBSERVATION", "PATTERN", "WARNING", "WINNING_STRATEGY", "HYPOTHESIS"]).default("OBSERVATION"),
    niche: z.string().optional(),
    vehicleType: z.string().optional(),
    platform: z.string().optional(),
    tags: z.array(z.string()).optional(),
    campaignId: z.string().optional(),
    starred: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("playbook"),
    name: z.string().min(1),
    summary: z.string().min(1),
    niche: z.string().optional(),
    vehicleType: z.string().optional(),
    platform: z.string().optional(),
    objective: z.string().optional(),
    tags: z.array(z.string()).optional(),
    starred: z.boolean().optional(),
  }),
]);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patternSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  if (data.kind === "hook") {
    const created = await prisma.creative.create({
      data: {
        name: data.hook.slice(0, 80),
        hook: data.hook,
        format: data.format,
        angle: data.angle,
        niche: data.niche,
        vehicleType: data.vehicleType,
        platform: data.platform,
        retention: data.retention,
        ctr: data.ctr,
        cpl: data.cpl,
        notes: data.notes,
        tags: data.tags ?? [],
        campaignId: data.campaignId || null,
        winner: data.winner ?? false,
        starred: data.winner ?? false,
      },
    });
    return NextResponse.json({ kind: "hook", record: created }, { status: 201 });
  }

  if (data.kind === "creative") {
    const created = await prisma.creative.create({
      data: {
        name: data.name,
        hook: data.hook,
        format: data.format,
        angle: data.angle,
        style: data.style,
        niche: data.niche,
        vehicleType: data.vehicleType,
        platform: data.platform,
        retention: data.retention,
        ctr: data.ctr,
        cpl: data.cpl,
        notes: data.notes,
        tags: data.tags ?? [],
        campaignId: data.campaignId || null,
        winner: data.winner ?? false,
        starred: false,
      },
    });
    return NextResponse.json({ kind: "creative", record: created }, { status: 201 });
  }

  if (data.kind === "insight") {
    if (data.campaignId) {
      const created = await prisma.campaignInsight.create({
        data: {
          content: data.content,
          type: data.type,
          niche: data.niche,
          vehicleType: data.vehicleType,
          platform: data.platform,
          tags: data.tags ?? [],
          campaignId: data.campaignId,
          starred: data.starred ?? false,
        },
      });
      return NextResponse.json({ kind: "insight", scope: "campaign", record: created }, { status: 201 });
    }
    const created = await prisma.globalInsight.create({
      data: {
        content: data.content,
        type: data.type,
        niche: data.niche,
        vehicleType: data.vehicleType,
        platform: data.platform,
        tags: data.tags ?? [],
        starred: data.starred ?? false,
      },
    });
    return NextResponse.json({ kind: "insight", scope: "global", record: created }, { status: 201 });
  }

  if (data.kind === "playbook") {
    const created = await prisma.playbook.create({
      data: {
        name: data.name,
        summary: data.summary,
        niche: data.niche,
        vehicleType: data.vehicleType,
        platform: data.platform,
        objective: data.objective,
        tags: data.tags ?? [],
        starred: data.starred ?? false,
      },
    });
    return NextResponse.json({ kind: "playbook", record: created }, { status: 201 });
  }

  return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
}
