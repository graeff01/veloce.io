import { NextResponse } from "next/server";
import { guardPortal } from "@/lib/portal-guard";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { sendManualMessage } from "@/lib/ai-agent/respond";
import { prisma } from "@/lib/prisma";
import { gateOnce } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";

// POST — a equipe do cliente responde o lead com TEXTO LIVRE a partir do painel.
// Token-scoped: sendManualMessage confere que o contato é do próprio cliente (isolamento).
// Auth: quando o portal é protegido, exige sessão (agnóstico ao método de login — OTP hoje,
// login+senha depois). Persiste com aiGenerated=false → aciona o takeover (silencia o bot).
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  // Passa pelo gate central. Antes fazia a própria checagem de sessão, o que
  // bastava para AUTENTICAR mas deixava de fora as regras que vivem no gate —
  // entre elas a de quem só acompanha, que daqui mandaria mensagem de verdade
  // para o WhatsApp de um lead.
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;
  const email = portal.email;

  const body = await req.json().catch(() => ({}));

  // ── Chave de idempotência (opcional) ───────────────────────────────────────
  // Quem tem FILA DE ENVIO reenvia sozinho quando a rede volta — e sem isto um
  // reenvio de uma tentativa que na verdade CHEGOU mandaria a mesma mensagem
  // duas vezes para um cliente real. Nunca para um log nosso: para o WhatsApp
  // de uma pessoa.
  //
  // A trava é a mesma dos orçamentos: reivindica ANTES de enviar (atômico pelo
  // índice único de dedupeKey) e LIBERA se o envio falhar, para a próxima
  // tentativa poder trabalhar. Quem chega com uma chave já usada recebe
  // `duplicada: true` — que o cliente trata como sucesso, porque foi.
  const chave = typeof body?.key === "string" && body.key.length >= 8 && body.key.length <= 100
    ? `portal-send:${portal.clientId}:${body.key}` : null;
  if (chave && !(await gateOnce(chave))) {
    return NextResponse.json({ ok: true, duplicada: true, message: null });
  }

  const r = await sendManualMessage(portal.clientId, contactId, typeof body?.text === "string" ? body.text : "", email);
  if (!r.ok) {
    // Não saiu: libera a chave, senão a mensagem ficaria presa para sempre.
    if (chave) await prisma.notificationLog.deleteMany({ where: { dedupeKey: chave } }).catch(() => {});
    return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  }
  return NextResponse.json({ ok: true, message: r.message });
}
