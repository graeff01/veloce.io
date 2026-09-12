import { NextResponse } from "next/server";
import { guardPortal } from "@/lib/portal-guard";
import { sendManualMedia } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

const KINDS = ["image", "audio", "document"] as const;
type Kind = (typeof KINDS)[number];

// POST multipart { file, kind, caption? } — a equipe manda imagem/documento/áudio ao lead.
// Mesmo escopo/auth do envio de texto.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  // Mesmo gate do envio de texto — inclusive a regra de quem só acompanha.
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;
  const email = portal.email;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") || "");
  const caption = form?.get("caption") ? String(form.get("caption")) : undefined;
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (!KINDS.includes(kind as Kind)) return NextResponse.json({ error: "Tipo de mídia inválido." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const r = await sendManualMedia(portal.clientId, contactId, kind as Kind, buffer, file.type || "application/octet-stream", file.name || undefined, caption, email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, message: r.message });
}
