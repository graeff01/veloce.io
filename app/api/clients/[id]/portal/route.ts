import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getOrCreatePortal, updatePortal, rotatePortalToken } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET — link do painel (cria token na 1ª vez) + tema atual + logo (p/ extrair cor).
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const [p, client] = await Promise.all([
    getOrCreatePortal(id),
    prisma.client.findUnique({ where: { id }, select: { logoUrl: true } }),
  ]);
  return NextResponse.json({ ...p, logoUrl: client?.logoUrl ?? null });
}

// PUT — atualiza tema (cor/modo), ativa/desativa ou rotaciona o link.
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));

  if (body.rotate === true) { await rotatePortalToken(id); }

  const data: { accentColor?: string | null; mode?: string; active?: boolean; requireLogin?: boolean; maxUsers?: number } = {};
  if ("accentColor" in body) data.accentColor = (body.accentColor as string)?.trim() || null;
  if (typeof body.mode === "string" && ["light", "dark", "auto"].includes(body.mode)) data.mode = body.mode;
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.requireLogin === "boolean") data.requireLogin = body.requireLogin;
  if (typeof body.maxUsers === "number" && Number.isFinite(body.maxUsers)) data.maxUsers = Math.min(50, Math.max(1, Math.round(body.maxUsers)));
  if (Object.keys(data).length > 0) await updatePortal(id, data);

  return NextResponse.json(await getOrCreatePortal(id));
}
