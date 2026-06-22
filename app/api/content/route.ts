import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { parseDueDate } from "@/lib/utils";
import { logActivity } from "@/lib/content/activity";
import { z } from "zod";

export const runtime = "nodejs";

// GET /api/content — lista os posts de conteúdo da Veloce (não é por cliente).
export async function GET() {
  const { error } = await requireAuth("content:read");
  if (error) return error;

  const posts = await prisma.contentPost.findMany({
    where: { deletedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(posts);
}

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["feed", "carrossel"]).optional(),
  copy: z.string().optional().nullable(),
  references: z.string().optional().nullable(),
  publishDate: z.string().optional().nullable(),
});

// POST /api/content — cria uma pauta (gestor/operacional). Designer não cria.
export async function POST(req: Request) {
  const { error, session } = await requireAuth("content:create");
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  const count = await prisma.contentPost.count({ where: { deletedAt: null, status: "pauta" } });
  const post = await prisma.contentPost.create({
    data: {
      title: d.title.trim(),
      type: d.type ?? "feed",
      copy: d.copy || null,
      references: d.references || null,
      publishDate: d.publishDate ? parseDueDate(d.publishDate) : null,
      status: "pauta",
      order: count,
      createdById: session!.user.id,
    },
  });
  await logActivity({ postId: post.id, authorId: session!.user.id, authorName: session!.user.name ?? "Alguém", kind: "created", body: "criou a pauta" });
  return NextResponse.json(post, { status: 201 });
}
