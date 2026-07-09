import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const windowSchema = z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() });

const intakeFieldSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  required: z.boolean().optional(),
  type: z.enum(["text", "number", "boolean", "option"]).optional(),
  options: z.array(z.string().max(60)).optional(),
});

const putSchema = z.object({
  enabled: z.boolean().optional(),
  status: z.enum(["draft", "test", "live"]).optional(),
  vertical: z.string().max(40).optional(),
  blockedTopics: z.array(z.object({ pattern: z.string().max(400), reason: z.string().max(200) })).optional(),
  audioTranscription: z.boolean().optional(),
  model: z.string().optional(),
  persona: z.string().max(2000).nullable().optional(),
  goals: z.string().max(2000).nullable().optional(),
  rules: z.string().max(6000).nullable().optional(),
  businessHours: z.array(windowSchema).optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  fallbackMessage: z.string().max(1000).nullable().optional(),
  handoffAfter: z.number().int().min(0).max(20).optional(),
  // F1/F2/F3 — recursos avançados (todos opcionais, default off no schema)
  verifyReplies: z.boolean().optional(),
  groundingEnforce: z.boolean().optional(),
  alwaysOn: z.boolean().optional(),
  quotesEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  humanize: z.boolean().optional(),
  visionEnabled: z.boolean().optional(),
  intakeSpec: z.array(intakeFieldSchema).optional(),
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
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const cfg = await prisma.aiAgentConfig.upsert({
    where: { clientId: id },
    create: { clientId: id, ...d, businessHours: d.businessHours ?? [] },
    update: d,
  });
  return NextResponse.json(cfg);
}
