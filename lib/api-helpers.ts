import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type Permission =
  | "clients:read" | "clients:create" | "clients:update" | "clients:delete"
  | "tasks:read" | "tasks:create" | "tasks:update" | "tasks:delete"
  | "plans:read" | "plans:create" | "plans:update" | "plans:delete"
  | "checklist:update"
  | "users:read" | "users:create" | "users:update" | "users:delete"
  | "content:read" | "content:create" | "content:update" | "content:delete" | "content:approve";

export async function requireAuth(permission?: Permission) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), session: null };
  }

  if (permission && !hasPermission(session.user.role as Role, permission)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }), session: null };
  }

  return { error: null, session };
}

/**
 * Autorização de LEITURA escopada por cliente, usada nas rotas das abas que o
 * gestor (MANAGER) pode ver (WhatsApp, Anúncios/Meta, Google + detalhe do cliente).
 *
 * - ADMIN/OPERATIONAL: passam se tiverem a permissão de leitura de clientes (comportamento atual).
 * - MANAGER: passa SÓ se o cliente estiver na carteira dele (relação managedClients).
 * - Demais papéis (ex.: DESIGNER): negados.
 *
 * Escrita continua barrada para o gestor porque ele não tem `clients:update` —
 * as rotas de escrita seguem usando `requireAuth("clients:update")`.
 */
export async function requireClientAccess(clientId: string) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), session: null };
  }

  const role = session.user.role as Role;

  if (role === "MANAGER") {
    const count = await prisma.client.count({
      where: { id: clientId, deletedAt: null, managers: { some: { id: session.user.id } } },
    });
    if (count === 0) {
      return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }), session: null };
    }
    return { error: null, session };
  }

  if (!hasPermission(role, "clients:read")) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }), session: null };
  }

  return { error: null, session };
}

export async function logAction(
  userId: string,
  action: string,
  clientId?: string,
  taskId?: string,
  details?: object
) {
  await prisma.executionLog.create({
    data: {
      userId,
      action,
      clientId: clientId ?? null,
      taskId: taskId ?? null,
      details: details ?? undefined,
    },
  });
}
