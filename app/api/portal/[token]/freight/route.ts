import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

type FreightRow = { region: string; amount: number };
// Diff legível (frete = dinheiro): o que foi ADICIONADO, REMOVIDO ou teve PREÇO alterado.
function freightDiff(before: FreightRow[], after: FreightRow[]) {
  const key = (f: FreightRow) => (f.region || "").trim().toLowerCase();
  const b = new Map(before.map((f) => [key(f), f.amount]));
  const a = new Map(after.map((f) => [key(f), f.amount]));
  const priceChanges: { region: string; from: number; to: number }[] = [];
  const added: string[] = [], removed: string[] = [];
  for (const f of after) { const k = key(f); if (!b.has(k)) added.push(f.region); else if (b.get(k) !== f.amount) priceChanges.push({ region: f.region, from: b.get(k)!, to: f.amount }); }
  for (const f of before) if (!a.has(key(f))) removed.push(f.region);
  return { priceChanges, added, removed };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Frete por região editado pelo CLIENTE no portal. Lê/grava PricingConfig.rules.freight
// (mesma tabela que a IA usa p/ cotar). Escopo pelo token do portal (não é a auth
// interna da Veloce). Preserva o resto das rules (base/options/fees/…).
const freightSchema = z.object({
  region: z.string().min(1).max(120),
  amount: z.number(),
  city: z.string().max(120).optional(),
  zone: z.string().max(60).optional(),
  aliases: z.array(z.string().max(120)).max(200).optional(), // apelidos legados
  neighborhoods: z.array(z.object({ name: z.string().min(1).max(120), lat: z.number().optional(), lng: z.number().optional() })).max(500).optional(),
  code: z.string().max(12).nullable().optional(),
  assembly: z.enum(["optional", "required"]).optional(),
});
const putSchema = z.object({ freight: z.array(freightSchema).max(2000) });

async function auth(token: string) {
  const portal = await resolvePortal(token);
  if (!portal) return { error: NextResponse.json({ error: "Link inválido" }, { status: 404 }) };
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return { error: NextResponse.json({ error: "Faça login." }, { status: 401 }) };
  }
  return { clientId: portal.clientId };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { clientId, error } = await auth(token);
  if (error) return error;
  const pc = await prisma.pricingConfig.findUnique({ where: { clientId } });
  const rules = (pc?.rules ?? {}) as { freight?: unknown };
  return NextResponse.json({ freight: Array.isArray(rules.freight) ? rules.freight : [] });
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { clientId, error } = await auth(token);
  if (error) return error;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const pc = await prisma.pricingConfig.findUnique({ where: { clientId } });
  if (!pc) return NextResponse.json({ error: "Sem tabela de preço configurada." }, { status: 400 });
  const rules = (pc.rules ?? {}) as Record<string, unknown>;
  const before = (Array.isArray(rules.freight) ? rules.freight : []) as FreightRow[];
  const updated = await prisma.pricingConfig.update({
    where: { clientId },
    data: { rules: { ...rules, freight: parsed.data.freight } as object },
  });

  // Histórico (frete = dinheiro): registra QUEM mudou QUAL preço QUANDO. Best-effort.
  const diff = freightDiff(before, parsed.data.freight);
  if (diff.priceChanges.length || diff.added.length || diff.removed.length) {
    const email = await getPortalSessionEmail(clientId).catch(() => null);
    await recordAudit({ clientId, action: "freight.update", meta: { by: email ?? "portal", ...diff } });
  }

  const r = (updated.rules ?? {}) as { freight?: unknown };
  return NextResponse.json({ freight: Array.isArray(r.freight) ? r.freight : [] });
}
