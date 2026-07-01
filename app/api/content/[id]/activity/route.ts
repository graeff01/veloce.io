import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { logActivity, notifyHandoff } from "@/lib/content/activity";
import type { Role } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";

// GET — feed da pauta (comentários + eventos), em ordem cronológica.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("content:read");
  if (error) return error;

  const items = await prisma.contentActivity.findMany({
    where: { postId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, authorId: true, authorName: true, kind: true, body: true, createdAt: true },
  });
  return NextResponse.json(items);
}

const schema = z.object({ body: z.string().min(1).max(2000) });

// POST — novo comentário no feed. Notifica a outra ponta (handoff).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("content:update");
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Comentário vazio" }, { status: 400 });

  const post = await prisma.contentPost.findFirst({ where: { id, deletedAt: null }, select: { title: true } });
  if (!post) return NextResponse.json({ error: "Pauta não encontrada" }, { status: 404 });

  const role = session!.user.role as Role;
  const actorName = session!.user.name ?? "Alguém";
  const actorId = session!.user.id;

  const activity = await logActivity({ postId: id, authorId: actorId, authorName: actorName, kind: "comment", body: parsed.data.body.trim() });

  await notifyHandoff({ event: "comment", postTitle: post.title, actorName, actorId, actorIsDesigner: role === "DESIGNER", commentSnippet: parsed.data.body });

  return NextResponse.json(activity, { status: 201 });
}
