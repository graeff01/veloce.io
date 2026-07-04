import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/notifications/web-push";
import type { Role } from "@prisma/client";

type Kind = "comment" | "status" | "art" | "created" | "edit" | "delete";

// Registra um item no feed da pauta (comentário ou evento automático).
export async function logActivity(opts: {
  postId: string; authorId?: string | null; authorName?: string | null; kind: Kind; body?: string | null;
}) {
  return prisma.contentActivity.create({
    data: {
      postId: opts.postId,
      authorId: opts.authorId ?? null,
      authorName: opts.authorName ?? null,
      kind: opts.kind,
      body: opts.body ?? null,
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Push web para todos os usuários ativos de certos papéis (menos quem agiu).
// Quem não assinou o push simplesmente não recebe — sem erro.
async function dmRoles(roles: Role[], excludeUserId: string | null, text: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: roles }, active: true, deletedAt: null },
    select: { id: true },
  });
  const body = text.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
  await Promise.all(
    users.filter((u) => u.id !== excludeUserId).map((u) => sendPushToUser(u.id, { title: "Pauta de conteúdo", body, url: "/content" }).catch(() => false)),
  );
}

// Notificações de handoff — o coração da comunicação saudável: avisar a outra
// ponta na hora em que a bola passa pro lado dela.
export async function notifyHandoff(opts: {
  event: "revisao" | "aprovado" | "comment";
  postTitle: string;
  actorName: string;
  actorId: string;
  actorIsDesigner: boolean;
  commentSnippet?: string | null;
}): Promise<void> {
  const who = `<b>${escapeHtml(opts.actorName)}</b>`;
  const what = `<b>${escapeHtml(opts.postTitle)}</b>`;
  try {
    if (opts.event === "revisao") {
      await dmRoles(["ADMIN"], opts.actorId, `🎨 ${who} mandou ${what} para revisão.`);
    } else if (opts.event === "aprovado") {
      await dmRoles(["DESIGNER"], opts.actorId, `✅ ${who} aprovou ${what}. Pode seguir! 🎉`);
    } else {
      const snip = opts.commentSnippet ? `:\n“${escapeHtml(opts.commentSnippet.slice(0, 160))}”` : "";
      // designer comentou → avisa gestores; gestor comentou → avisa designers.
      const target: Role[] = opts.actorIsDesigner ? ["ADMIN"] : ["DESIGNER"];
      await dmRoles(target, opts.actorId, `💬 ${who} comentou em ${what}${snip}`);
    }
  } catch {
    /* notificação é best-effort */
  }
}
