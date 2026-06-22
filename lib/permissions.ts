import { Role } from "@prisma/client";

type Permission =
  | "clients:read"
  | "clients:create"
  | "clients:update"
  | "clients:delete"
  | "tasks:read"
  | "tasks:create"
  | "tasks:update"
  | "tasks:delete"
  | "plans:read"
  | "plans:create"
  | "plans:update"
  | "plans:delete"
  | "checklist:update"
  | "users:read"
  | "users:create"
  | "users:update"
  | "users:delete"
  | "content:read"
  | "content:create"
  | "content:update"
  | "content:delete"
  | "content:approve";

const rolePermissions: Record<Role, Permission[] | ["*"]> = {
  ADMIN: ["*"],
  OPERATIONAL: [
    "clients:read",
    "tasks:read",
    "tasks:create",
    "tasks:update",
    "tasks:delete",
    "plans:read",
    "checklist:update",
    "content:read",
    "content:create",
    "content:update",
  ] as Permission[],
  // DESIGNER: papel ENXUTO — só o módulo de Conteúdo da Veloce. Lê a pauta, sobe
  // arte e move o card (criação→revisão). NÃO cria pauta, NÃO aprova, NÃO apaga,
  // e não tem acesso a clientes/finanças/IA/etc.
  DESIGNER: [
    "content:read",
    "content:update",
  ] as Permission[],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = rolePermissions[role] as (Permission | "*")[];
  if (perms.includes("*")) return true;
  return (perms as Permission[]).includes(permission);
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
