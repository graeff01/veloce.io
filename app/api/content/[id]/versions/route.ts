import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// GET — histórico de versões da arte de um post (V1, V2, ...).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("content:read");
  if (error) return error;

  const versions = await prisma.contentVersion.findMany({
    where: { postId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, artUrl: true, createdAt: true },
  });
  return NextResponse.json(versions);
}
