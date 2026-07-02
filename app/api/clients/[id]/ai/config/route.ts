import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const windowSchema = z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() });

const putSchema = z.object({
  enabled: z.boolean().optional(),
  status: z.enum(["draft", "test", "live"]).optional(),
  vertical: z.string().max(40).optional(),
  blockedTopics: z.array(z.object({ pattern: z.string().max(400), reason: z.string().max(200) })).optional(),
  audioTranscription: z.boolean().optional(),
  model: z.string().optional(),
  assistantName: z.string().max(60).nullable().optional(),
  greetingMessage: z.string().max(500).nullable().optional(),
  trustHighlights: z.string().max(300).nullable().optional(),
  catalogSourceUrl: z.string().max(500).nullable().optional(),
  persona: z.string().max(2000).nullable().optional(),
  goals: z.string().max(2000).nullable().optional(),
  rules: z.string().max(6000).nullable().optional(),
  businessHours: z.array(windowSchema).optional(),
  answerMode: z.enum(["off_hours", "always", "ads_in_hours"]).optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  fallbackMessage: z.string().max(1000).nullable().optional(),
  handoffAfter: z.number().int().min(0).max(20).optional(),
  paused: z.boolean().optional(),
  pausedReason: z.string().max(200).nullable().optional(),
  dailyUsdCap: z.number().min(0).max(1000).nullable().optional(),
  humanTakeoverMin: z.number().int().min(0).max(1440).optional(),
  scopeMode: z.enum(["all", "ads_only"]).optional(),
  disclosureEnabled: z.boolean().optional(),
  testMode: z.boolean().optional(),
  testNumbers: z.array(z.string().max(30)).max(50).optional(),
  operatorNumbers: z.array(z.string().max(30)).max(20).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: id } });
  return NextResponse.json(cfg);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const cfg = await prisma.aiAgentConfig.upsert({
    where: { clientId: id },
    create: { clientId: id, ...d, businessHours: d.businessHours ?? [] },
    update: d,
  });
  // Auditoria de mudanças sensíveis (kill-switch, status, escopo, teto, canário).
  if (d.paused !== undefined || d.status !== undefined || d.scopeMode !== undefined || d.dailyUsdCap !== undefined || d.testMode !== undefined) {
    await recordAudit({
      clientId: id, userId: session?.user?.id ?? null, action: "ai.config",
      meta: { paused: d.paused, status: d.status, scopeMode: d.scopeMode, dailyUsdCap: d.dailyUsdCap, testMode: d.testMode },
    });
  }
  return NextResponse.json(cfg);
}
