import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/permissions";
import { parseDueDate } from "@/lib/utils";
import { logActivity, notifyHandoff } from "@/lib/content/activity";
import type { Role } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";

const APPROVAL_STATUSES = ["aprovado", "agendado", "publicado"];
const STAGE_LABEL: Record<string, string> = {
  pauta: "Pauta", criacao: "Em criação", revisao: "Revisão",
  aprovado: "Aprovado", agendado: "Agendado", publicado: "Publicado",
};

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(["feed", "carrossel"]).optional(),
  copy: z.string().optional().nullable(),
  references: z.string().optional().nullable(),
  publishDate: z.string().optional().nullable(),
  status: z.enum(["pauta", "criacao", "revisao", "aprovado", "agendado", "publicado"]).optional(),
  artUrl: z.string().optional().nullable(),
  feedback: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// PATCH /api/content/[id] — atualiza. Regras de papel:
//  • artUrl + mover para pauta/criacao/revisao → content:update (designer ok)
//  • briefing (title/type/copy/references/publishDate) e feedback → content:create (gestor)
//  • aprovar/agendar/publicar → content:approve (só admin)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("content:update");
  if (error) return error;
  const role = session!.user.role as Role;

  const post = await prisma.contentPost.findFirst({ where: { id, deletedAt: null } });
  if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const canBrief = hasPermission(role, "content:create");
  const canApprove = hasPermission(role, "content:approve");

  // Guard-rails de papel — nega antes de tocar no banco.
  const editsBriefing = d.title !== undefined || d.type !== undefined || d.copy !== undefined || d.references !== undefined || d.publishDate !== undefined || d.feedback !== undefined;
  if (editsBriefing && !canBrief) return NextResponse.json({ error: "Sem permissão para editar a pauta" }, { status: 403 });
  if (d.status !== undefined && APPROVAL_STATUSES.includes(d.status) && !canApprove) {
    return NextResponse.json({ error: "Só o gestor pode aprovar/agendar/publicar" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (d.artUrl !== undefined) data.artUrl = d.artUrl || null;   // link do Drive (designer ok)
  if (d.notes !== undefined) data.notes = d.notes || null;      // observações do designer (designer ok)
  if (d.status !== undefined) data.status = d.status;
  if (canBrief) {
    if (d.title !== undefined) data.title = d.title.trim();
    if (d.type !== undefined) data.type = d.type;
    if (d.copy !== undefined) data.copy = d.copy || null;
    if (d.references !== undefined) data.references = d.references || null;
    if (d.publishDate !== undefined) data.publishDate = d.publishDate ? parseDueDate(d.publishDate) : null;
    if (d.feedback !== undefined) data.feedback = d.feedback || null;
  }
  // Carimbo de aprovação.
  if (d.status === "aprovado" && post.status !== "aprovado") {
    data.approvedAt = new Date();
    data.approvedBy = session!.user.id;
  }

  const updated = await prisma.contentPost.update({ where: { id }, data });

  // Linha do tempo + handoff. authorName denormalizado p/ o feed.
  const actorName = session!.user.name ?? "Alguém";
  const actorId = session!.user.id;
  if (d.status !== undefined && d.status !== post.status) {
    await logActivity({ postId: id, authorId: actorId, authorName: actorName, kind: "status", body: `moveu para ${STAGE_LABEL[d.status] ?? d.status}` });
    if (d.status === "revisao") await notifyHandoff({ event: "revisao", postTitle: updated.title, actorName, actorId, actorIsDesigner: !canBrief });
    if (d.status === "aprovado") await notifyHandoff({ event: "aprovado", postTitle: updated.title, actorName, actorId, actorIsDesigner: !canBrief });
  }
  if (d.artUrl !== undefined && (d.artUrl || null) !== (post.artUrl || null)) {
    await logActivity({ postId: id, authorId: actorId, authorName: actorName, kind: "art", body: d.artUrl ? "atualizou o link da arte" : "removeu o link da arte" });
  }

  return NextResponse.json(updated);
}

// DELETE — só quem tem content:delete (admin). Soft delete.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("content:delete");
  if (error) return error;

  const post = await prisma.contentPost.findFirst({ where: { id, deletedAt: null } });
  if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });

  await prisma.contentPost.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
