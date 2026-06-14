import { NextResponse } from "next/server";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

export const runtime = "nodejs";

// Prompt Lab (grupo Construir).
// Fonte da verdade: PromptVariant (A/B que o juiz IA já mede via promptVariant) +
// AiAgentConfig como prompt-BASE read-only (editado na aba Configuração).
// "version" = uma PromptVariant; "base" = o prompt do cliente (persona/goals/rules).

// Monta um corpo legível a partir dos campos estruturados (display no front).
function composeBody(parts: { persona?: string | null; goals?: string | null; rules?: string | null; extra?: string | null }): string {
  const seg: string[] = [];
  if (parts.persona) seg.push(`PERSONA:\n${parts.persona}`);
  if (parts.goals) seg.push(`OBJETIVOS:\n${parts.goals}`);
  if (parts.rules) seg.push(`REGRAS:\n${parts.rules}`);
  if (parts.extra) seg.push(`INSTRUÇÕES EXTRAS:\n${parts.extra}`);
  return seg.join("\n\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const [cfg, variants] = await Promise.all([
    prisma.aiAgentConfig.findUnique({ where: { clientId: id }, select: { persona: true, goals: true, rules: true, updatedAt: true } }),
    prismaUnscoped.promptVariant.findMany({ where: { clientId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  const base = {
    id: "base",
    label: "Prompt base (Configuração)",
    body: composeBody({ persona: cfg?.persona, goals: cfg?.goals, rules: cfg?.rules }),
    active: true, // o base sempre vale como fallback quando nenhuma variante é sorteada
    isVariant: false,
    abWeight: null as number | null,
    createdAt: cfg?.updatedAt?.toISOString() ?? null,
    // campos estruturados expostos para edição na aba Configuração (read-only aqui)
    persona: cfg?.persona ?? null, goals: cfg?.goals ?? null, rules: cfg?.rules ?? null, extra: null,
  };

  const variantVersions = variants.map((v) => ({
    id: v.key,
    label: v.label || v.key,
    body: composeBody({ persona: v.personaOverride, goals: v.goalsOverride, rules: v.rulesOverride, extra: v.extraInstructions }),
    active: v.active,
    isVariant: true,
    abWeight: v.weight,
    createdAt: v.createdAt.toISOString(),
    persona: v.personaOverride, goals: v.goalsOverride, rules: v.rulesOverride, extra: v.extraInstructions,
  }));

  const activeVariants = variants.filter((v) => v.active && v.weight > 0);
  const abTest = activeVariants.length >= 2
    ? { enabled: true, variants: activeVariants.map((v) => ({ id: v.key, label: v.label || v.key, weight: v.weight })) }
    : null;

  return NextResponse.json({ versions: [base, ...variantVersions], abTest });
}

// Cria/edita uma VARIANTE de prompt (o base é editado na aba Configuração).
const upsertSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/, "use letras/números/-/_"),
  label: z.string().max(80).nullable().optional(),
  persona: z.string().max(2000).nullable().optional(),
  goals: z.string().max(2000).nullable().optional(),
  rules: z.string().max(6000).nullable().optional(),
  extra: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
  weight: z.number().int().min(0).max(100).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;
  if (d.key === "base") return NextResponse.json({ error: "O prompt base é editado na aba Configuração" }, { status: 400 });

  const fields = {
    label: d.label ?? undefined,
    personaOverride: d.persona ?? undefined,
    goalsOverride: d.goals ?? undefined,
    rulesOverride: d.rules ?? undefined,
    extraInstructions: d.extra ?? undefined,
    active: d.active ?? undefined,
    weight: d.weight ?? undefined,
  };

  const v = await prismaUnscoped.promptVariant.upsert({
    where: { clientId_key: { clientId: id, key: d.key } },
    create: {
      clientId: id, key: d.key, label: d.label ?? null,
      personaOverride: d.persona ?? null, goalsOverride: d.goals ?? null,
      rulesOverride: d.rules ?? null, extraInstructions: d.extra ?? null,
      active: d.active ?? true, weight: d.weight ?? 1,
    },
    update: fields,
  });
  return NextResponse.json({ ok: true, id: v.key });
}
