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
  // DESIGNER: módulo de Conteúdo da Veloce. LÊ o briefing (só leitura), sobe arte/prévia,
  // comenta e move o card. NÃO cria pauta, NÃO edita o briefing (é o gestor que monta),
  // NÃO aprova/agenda/publica e NÃO apaga. Sem acesso a clientes/finanças/IA/etc.
  // Toda ação fica na timeline da pauta (auditoria).
  DESIGNER: [
    "content:read",
    "content:update",
  ] as Permission[],
  // MANAGER (gestor): papel escopado. NÃO recebe nenhuma permissão global de
  // propósito — o acesso é por-cliente e só de LEITURA das abas de tráfego/WhatsApp,
  // validado em runtime por `requireClientAccess` (lib/api-helpers). Deixar vazio
  // aqui é fail-secure: qualquer rota que use `requireAuth("clients:read")` etc.
  // nega o gestor por padrão; só as rotas explicitamente liberadas o deixam entrar.
  MANAGER: [] as Permission[],
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
