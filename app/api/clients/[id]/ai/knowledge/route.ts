import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { embed } from "@/lib/openai";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(8000),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { clientId: id }, orderBy: { createdAt: "desc" },
    select: { id: true, title: true, content: true, createdAt: true },
  });
  return NextResponse.json(chunks);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  // Embedding p/ RAG. Sem OPENAI_API_KEY, salva sem vetor (não quebra o cadastro).
  let embedding: number[] = [];
  try { [embedding] = await embed([`${d.title ? `${d.title}\n` : ""}${d.content}`]); } catch { embedding = []; }

  const chunk = await prisma.knowledgeChunk.create({
    data: { clientId: id, title: d.title || null, content: d.content, embedding },
  });
  return NextResponse.json({ id: chunk.id, title: chunk.title, content: chunk.content, createdAt: chunk.createdAt }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const url = new URL(req.url);
  const chunkId = url.searchParams.get("chunkId");
  if (!chunkId) return NextResponse.json({ error: "chunkId obrigatório" }, { status: 400 });
  await prisma.knowledgeChunk.deleteMany({ where: { id: chunkId, clientId: id } });
  return NextResponse.json({ ok: true });
}
