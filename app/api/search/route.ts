import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const contains = q.length > 0 ? { contains: q, mode: "insensitive" as const } : undefined;

  const [clients, tasks, campaigns, users, logs] = await Promise.all([
    prisma.client.findMany({
      where: {
        deletedAt: null,
        ...(contains ? { OR: [{ name: contains }, { email: contains }] } : {}),
      },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        ...(contains
          ? {
              OR: [
                { title: contains },
                { description: contains },
                { type: contains },
                { blocker: contains },
                { client: { name: contains } },
                { assignee: { name: contains } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        clientId: true,
        title: true,
        type: true,
        status: true,
        blocker: true,
        dueDate: true,
        client: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        type: { equals: "Campanha", mode: "insensitive" },
        ...(contains ? { OR: [{ title: contains }, { client: { name: contains } }] } : {}),
      },
      select: {
        id: true,
        clientId: true,
        title: true,
        status: true,
        dueDate: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        active: true,
        ...(contains ? { OR: [{ name: contains }, { email: contains }] } : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: 8,
    }),
    prisma.executionLog.findMany({
      where: contains
        ? {
            OR: [
              { action: contains },
              { client: { name: contains } },
              { task: { title: contains } },
              { user: { name: contains } },
            ],
          }
        : {},
      include: {
        client: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, clientId: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: contains ? 60 : 8,
    }),
  ]);

  const normalized = q.toLowerCase();
  const filteredLogs = logs
    .filter((log) => {
      if (!q) return true;
      return JSON.stringify(log.details ?? {}).toLowerCase().includes(normalized)
        || log.action.toLowerCase().includes(normalized)
        || log.client?.name.toLowerCase().includes(normalized)
        || log.task?.title.toLowerCase().includes(normalized)
        || log.user.name.toLowerCase().includes(normalized);
    })
    .slice(0, 8);

  return NextResponse.json({
    clients: clients.map((client) => ({
      id: client.id,
      type: "client",
      title: client.name,
      subtitle: client.status === "ACTIVE" ? "Cliente ativo" : `Cliente ${client.status.toLowerCase()}`,
      href: `/clients/${client.id}`,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      type: "task",
      title: task.title,
      subtitle: `${task.client.name}${task.assignee ? ` / ${task.assignee.name}` : ""}${task.blocker ? ` / ${task.blocker}` : ""}`,
      meta: task.blocker ? "Bloqueada" : task.type ?? task.status,
      href: `/clients/${task.clientId}/tasks`,
    })),
    campaigns: campaigns.map((task) => ({
      id: task.id,
      type: "campaign",
      title: task.title,
      subtitle: task.client.name,
      meta: task.status,
      href: `/clients/${task.clientId}/tasks`,
    })),
    users: users.map((user) => ({
      id: user.id,
      type: "user",
      title: user.name,
      subtitle: user.email,
      meta: user.role === "ADMIN" ? "Admin" : "Operacional",
      href: "/settings",
    })),
    activities: filteredLogs.map((log) => {
      const note = getNote(log.details);
      const clientId = log.client?.id ?? log.task?.clientId;
      return {
        id: log.id,
        type: log.action === "ADD_NOTE" ? "note" : "activity",
        title: note ?? getActivityTitle(log.action),
        subtitle: `${log.client?.name ?? "Operacao"} / ${log.user.name}`,
        meta: log.action === "ADD_NOTE" ? "Nota" : "Atividade",
        href: clientId ? `/clients/${clientId}` : "/today",
      };
    }),
  });
}

function getNote(details: unknown) {
  if (!details || typeof details !== "object") return null;
  const note = (details as { note?: unknown }).note;
  return typeof note === "string" ? note : null;
}

function getActivityTitle(action: string) {
  const labels: Record<string, string> = {
    CREATE_TASK: "Tarefa criada",
    UPDATE_STATUS: "Status alterado",
    DELETE_TASK: "Tarefa removida",
    APPLY_PLAN: "Plano aplicado",
    UPDATE_CLIENT: "Cliente atualizado",
    CREATE_CLIENT: "Cliente criado",
    ADD_NOTE: "Observacao interna",
  };
  return labels[action] ?? "Atividade registrada";
}
