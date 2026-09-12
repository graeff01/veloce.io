import { NextResponse } from "next/server";
import { guardPortal } from "@/lib/portal-guard";
import { prisma } from "@/lib/prisma";
import { setAssignment } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

// POST { email } — define o DONO do lead (assumir=meu e-mail; transferir=outro; null=remover).
// Se "email" não vier, assume para o próprio usuário logado. Mesmo escopo/auth do send.
//
// Permissão: o ATENDENTE só pode ASSUMIR um lead livre (sem dono, ou já dele). Transferir
// para outro ou REMOVER o dono de outro atendente é exclusivo do ADMIN.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  // Pelo gate central: além de autenticar, é ele que barra quem só acompanha.
  // Trocar o dono de um lead com um toque errado no telefone da gerente seria
  // exatamente o que o papel de acompanhamento existe para impedir.
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;
  const me = portal.email;
  const isAdmin = portal.isAdmin;

  const body = await req.json().catch(() => ({}));
  const email = "email" in (body || {}) ? (body.email === null ? null : String(body.email)) : me; // sem email → assume p/ mim

  // Trava de papel: atendente não mexe no dono de lead de outro atendente (nem remove).
  if (!isAdmin) {
    const conv = await prisma.waConversation.findFirst({
      where: {
        contactId,
        connection: { clientId: portal.clientId, ...(portal.conexoesVisiveis ? { id: { in: portal.conexoesVisiveis } } : {}) },
      },
      select: { assignedEmail: true },
    });
    const current = conv?.assignedEmail ?? null;
    const claimingSelf = !!me && email === me;
    const currentlyFree = current === null || current === me;
    if (!(claimingSelf && currentlyFree)) {
      return NextResponse.json({ error: "Apenas o admin pode transferir ou remover o lead de outro atendente." }, { status: 403 });
    }
  }

  const r = await setAssignment(portal.clientId, contactId, email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, assignedEmail: r.assignedEmail });
}
