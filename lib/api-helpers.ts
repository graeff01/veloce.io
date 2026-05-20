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
  | "users:read" | "users:create" | "users:update" | "users:delete";

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
