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
  | "users:delete";

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
  ] as Permission[],
  // CLIENT não tem NENHUMA permissão interna. O acesso executivo do cliente é
  // controlado por um guard dedicado (requireClientAuth), nunca por requireAuth.
  CLIENT: [] as Permission[],
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
