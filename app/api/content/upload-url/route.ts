import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { isR2Configured, presignUpload, publicUrl, extFor } from "@/lib/r2";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ postId: z.string().min(1), contentType: z.string().min(1) });

// POST — devolve uma URL presignada para o navegador subir a arte direto no R2.
// Se o R2 não estiver configurado, responde { configured: false } e o front cai
// no modo data-URL (3MB) — assim funciona antes e depois de ligar o storage.
export async function POST(req: Request) {
  const { error } = await requireAuth("content:update");
  if (error) return error;

  if (!isR2Configured()) return NextResponse.json({ configured: false });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  if (!parsed.data.contentType.startsWith("image/")) return NextResponse.json({ error: "Só imagens" }, { status: 400 });

  const key = `content/${parsed.data.postId}/${Date.now()}.${extFor(parsed.data.contentType)}`;
  const uploadUrl = await presignUpload(key, parsed.data.contentType);
  return NextResponse.json({ configured: true, uploadUrl, publicUrl: publicUrl(key) });
}
