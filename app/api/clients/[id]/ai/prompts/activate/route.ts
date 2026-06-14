import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

export const runtime = "nodejs";

// Ativa uma versão de prompt ou define o split A/B.
//  • { key: "base" }                  → só o prompt base (desativa todas as variantes)
//  • { key: "B" }                     → ativa só essa variante (peso 1, exclusiva)
//  • { variants: [{key, weight}...] } → split A/B (ativa as listadas com seus pesos,
//                                        desativa o resto)
// O orquestrador já sorteia entre as variantes ativas (resolveVariant/pickWeighted);
// null → cai no prompt base. Aqui só mexemos no estado active/weight.
const schema = z.union([
  z.object({ key: z.string().min(1).max(40) }),
  z.object({ variants: z.array(z.object({ key: z.string().min(1).max(40), weight: z.number().int().min(1).max(100) })).min(1).max(10) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const existing = await prismaUnscoped.promptVariant.findMany({ where: { clientId: id }, select: { key: true } });
  const known = new Set(existing.map((v) => v.key));

  // Mapa de pesos desejados por variante (ausente = desativar).
  const desired = new Map<string, number>();
  if ("variants" in parsed.data) {
    for (const v of parsed.data.variants) {
      if (!known.has(v.key)) return NextResponse.json({ error: `Variante desconhecida: ${v.key}` }, { status: 404 });
      desired.set(v.key, v.weight);
    }
  } else if (parsed.data.key !== "base") {
    if (!known.has(parsed.data.key)) return NextResponse.json({ error: "Variante não encontrada" }, { status: 404 });
    desired.set(parsed.data.key, 1);
  } // key === "base" → desired vazio (desativa todas)

  // Aplica em lote: as desejadas viram active+peso; as demais ficam inativas.
  await prismaUnscoped.$transaction([
    prismaUnscoped.promptVariant.updateMany({
      where: { clientId: id, key: { notIn: [...desired.keys()] } },
      data: { active: false },
    }),
    ...[...desired.entries()].map(([key, weight]) =>
      prismaUnscoped.promptVariant.updateMany({ where: { clientId: id, key }, data: { active: true, weight } })
    ),
  ]);

  return NextResponse.json({ ok: true });
}
