import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { keyFromUrl, presignDownload } from "@/lib/r2";

export const runtime = "nodejs";

// GET — baixa a arte em 100% de qualidade (arquivo original do R2), forçando
// "salvar como". Para artes legadas em data URL, o front baixa direto.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("content:read");
  if (error) return error;

  const post = await prisma.contentPost.findFirst({ where: { id, deletedAt: null }, select: { title: true, artUrl: true } });
  if (!post?.artUrl) return NextResponse.json({ error: "Sem arte" }, { status: 404 });

  const key = keyFromUrl(post.artUrl);
  if (!key) return NextResponse.json({ error: "Arte não está no storage" }, { status: 409 });

  const slug = (post.title || "arte").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "arte";
  const ext = key.split(".").pop() || "png";
  const url = await presignDownload(key, `${slug}.${ext}`);
  return NextResponse.redirect(url);
}
