import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { sendManualMedia } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

const KINDS = ["image", "audio", "document"] as const;
type Kind = (typeof KINDS)[number];

// POST multipart { file, kind, caption? } — a equipe manda imagem/documento/áudio ao lead.
// Mesmo escopo/auth do envio de texto.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if (await isProtected(portal.clientId)) {
    const email = await getPortalSessionEmail(portal.clientId);
    if (!email) return NextResponse.json({ error: "Faça login para responder o lead." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") || "");
  const caption = form?.get("caption") ? String(form.get("caption")) : undefined;
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (!KINDS.includes(kind as Kind)) return NextResponse.json({ error: "Tipo de mídia inválido." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const r = await sendManualMedia(portal.clientId, contactId, kind as Kind, buffer, file.type || "application/octet-stream", file.name || undefined, caption);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, message: r.message });
}
