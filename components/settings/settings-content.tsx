"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATIONAL";
  operationalRole?: string | null;
  active: boolean;
  createdAt: string;
}

export function SettingsContent() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      user.name.toLowerCase().includes(normalized) ||
      user.email.toLowerCase().includes(normalized) ||
      user.role.toLowerCase().includes(normalized)
    );
  }, [query, users]);

  const activeUsers = users.filter((user) => user.active).length;
  const adminUsers = users.filter((user) => user.role === "ADMIN").length;
  const openTasksLabel = "Prioridades, status, blockers e templates";

  async function toggleActive(user: UserData) {
    await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    load();
  }

  async function changeRole(user: UserData, role: "ADMIN" | "OPERATIONAL") {
    await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function changeOperationalRole(user: UserData, operationalRole: string) {
    await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationalRole }),
    });
    load();
  }

  async function deleteUser(user: UserData) {
    if (user.id === session?.user.id) return;
    if (!confirm(`Tem certeza que deseja excluir ${user.name}?`)) return;
    await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    load();
  }

  const [wiping, setWiping] = useState(false);
  async function wipeTasks() {
    if (!confirm("Isso vai REMOVER todas as tarefas e movimentações do Kanban e do Calendário de TODOS os clientes. Tem certeza?")) return;
    if (!confirm("Confirmação final: zerar tudo para começar do zero?")) return;
    setWiping(true);
    try {
      const res = await fetch("/api/tasks/wipe", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        alert(`Zerado: ${data?.tasks ?? 0} tarefa(s) e ${data?.movements ?? 0} movimentação(ões) removida(s). Kanban e calendário limpos.`);
      } else {
        alert(data?.error ?? "Não foi possível zerar as tarefas.");
      }
    } catch {
      alert("Falha de rede ao zerar as tarefas.");
    }
    setWiping(false);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "26px 32px 22px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 8,
              }}
            >
              Workspace
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: "30px", color: "var(--text-primary)" }}>
              Configuracoes
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5 }}>
              Controle de usuarios, funcoes e acesso operacional.
            </p>
          </div>

          <Button variant="primary" size="sm" onClick={() => setNewUserOpen(true)}>
            <Plus size={14} /> Novo usuario
          </Button>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 32px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
          <Metric label="Usuarios" value={users.length} />
          <Metric label="Ativos" value={activeUsers} tone="green" />
          <Metric label="Administradores" value={adminUsers} tone="accent" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
          <WorkspaceTile title="Workspace" value="Veloce OPS" detail="Ambiente operacional da agencia" />
          <WorkspaceTile title="Equipe" value={`${activeUsers} ativos`} detail="Perfis e acessos leves" />
          <WorkspaceTile title="Operacao" value="Fluxo padrao" detail={openTasksLabel} />
          <WorkspaceTile title="Aparencia" value="Dark premium" detail="Densidade alta, motion discreto" />
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              background: "var(--bg-panel)",
            }}
          >
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)" }}>
                Usuarios do sistema
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {filteredUsers.length} de {users.length} exibidos
              </p>
            </div>

            <div style={{ position: "relative", width: 280, flexShrink: 0 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                  pointerEvents: "none",
                }}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar usuario..."
                style={{
                  width: "100%",
                  height: 36,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  padding: "0 12px 0 34px",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 1.4fr) 180px 180px 140px 108px",
              gap: 16,
              alignItems: "center",
              padding: "10px 16px",
              background: "var(--bg-base)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {["Usuario", "Perfil", "Permissao", "Status", "Acoes"].map((header) => (
              <span
                key={header}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  textAlign: header === "Acoes" ? "right" : "left",
                }}
              >
                {header}
              </span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} style={{ height: 58, borderRadius: 8, background: "var(--bg-base)", animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: "54px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Nenhum operador encontrado.
            </div>
          ) : (
            <div>
              {filteredUsers.map((user, index) => (
                <UserRow
                  key={user.id}
                  user={user}
                  currentUserId={session?.user.id}
                  last={index === filteredUsers.length - 1}
                  onRoleChange={changeRole}
                  onOperationalRoleChange={changeOperationalRole}
                  onToggleActive={toggleActive}
                  onEdit={setEditingUser}
                  onDelete={deleteUser}
                />
              ))}
            </div>
          )}
        </div>

        {/* Danger zone — admin only */}
        {session?.user.role === "ADMIN" && (
          <div
            style={{
              marginTop: 18,
              background: "var(--bg-surface)",
              border: "1px solid rgba(220,38,38,0.3)",
              borderRadius: 10,
              boxShadow: "var(--shadow-card)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
              <h2 style={{ fontSize: 14, fontWeight: 650, color: "var(--red, #DC2626)" }}>Zona de risco</h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Ações irreversíveis. Use com cuidado.
              </p>
            </div>
            <div style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Zerar tarefas e movimentações</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Remove todas as tarefas e movimentações do Kanban e do Calendário de todos os clientes para começar do zero.
                </p>
              </div>
              <button
                onClick={wipeTasks}
                disabled={wiping}
                style={{
                  flexShrink: 0,
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(220,38,38,0.4)",
                  background: "rgba(220,38,38,0.08)",
                  color: "var(--red, #DC2626)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: wiping ? "not-allowed" : "pointer",
                  opacity: wiping ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Trash2 size={14} /> {wiping ? "Zerando..." : "Zerar tarefas"}
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal open={newUserOpen} onClose={() => setNewUserOpen(false)} title="Novo usuario" size="sm">
        <UserForm
          onSuccess={() => { setNewUserOpen(false); load(); }}
          onCancel={() => setNewUserOpen(false)}
        />
      </Modal>

      {editingUser && (
        <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Editar usuario" size="sm" variant="drawer">
          <UserForm
            user={editingUser}
            onSuccess={() => { setEditingUser(null); load(); }}
            onCancel={() => setEditingUser(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "green" | "accent" }) {
  const color = tone === "green" ? "var(--green)" : tone === "accent" ? "var(--accent)" : "var(--text-primary)";
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "12px 14px",
        minHeight: 72,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 720, lineHeight: 1, color }}>{value}</p>
    </div>
  );
}

function WorkspaceTile({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div
      style={{
        minHeight: 88,
        padding: "13px 14px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        background: "linear-gradient(180deg, var(--bg-surface), var(--bg-panel))",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>{title}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{value}</p>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: "15px" }}>{detail}</p>
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  last,
  onRoleChange,
  onOperationalRoleChange,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  user: UserData;
  currentUserId?: string;
  last: boolean;
  onRoleChange: (user: UserData, role: "ADMIN" | "OPERATIONAL") => void;
  onOperationalRoleChange: (user: UserData, operationalRole: string) => void;
  onToggleActive: (user: UserData) => void;
  onEdit: (user: UserData) => void;
  onDelete: (user: UserData) => void;
}) {
  const isCurrent = user.id === currentUserId;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1.4fr) 180px 180px 140px 108px",
        gap: 16,
        alignItems: "center",
        minHeight: 70,
        padding: "12px 16px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        transition: "background 140ms ease-out",
      }}
      onMouseEnter={(event) => (event.currentTarget.style.background = "var(--bg-base)")}
      onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <Avatar name={user.name} size="sm" />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 620,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user.name}
            </p>
            {isCurrent && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                voce
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user.email}
          </p>
        </div>
      </div>

      <div>
        <select
          value={user.operationalRole ?? "Operacoes"}
          onChange={(event) => onOperationalRoleChange(user, event.target.value)}
          style={{
            width: 160,
            height: 34,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-surface)",
            color: "var(--text-secondary)",
            padding: "0 10px",
            fontSize: 12,
            outline: "none",
          }}
        >
          <option value="Founder">Founder</option>
          <option value="Operacoes">Operacoes</option>
          <option value="Design">Design</option>
          <option value="Trafego">Trafego</option>
          <option value="Social">Social</option>
          <option value="Atendimento">Atendimento</option>
        </select>
      </div>

      <div>
        {isCurrent ? (
          <Badge variant={user.role === "ADMIN" ? "purple" : "blue"}>
            {user.role === "ADMIN" ? <Shield size={10} /> : <UserRound size={10} />}
            {user.role === "ADMIN" ? "Admin" : "Operacional"}
          </Badge>
        ) : (
          <select
            value={user.role}
            onChange={(event) => onRoleChange(user, event.target.value as "ADMIN" | "OPERATIONAL")}
            style={{
              width: 150,
              height: 34,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              padding: "0 10px",
              fontSize: 12,
              outline: "none",
            }}
          >
            <option value="ADMIN">Admin</option>
            <option value="OPERATIONAL">Operacional</option>
          </select>
        )}
      </div>

      <div>
        <Badge variant={user.active ? "green" : "gray"}>
          {user.active ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
        {!isCurrent && (
          <>
            <button
              onClick={() => onEdit(user)}
              title="Editar usuario"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onToggleActive(user)}
              title={user.active ? "Desativar" : "Ativar"}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: user.active ? "var(--amber)" : "var(--green)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {user.active ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            </button>
            <button
              onClick={() => onDelete(user)}
              title="Excluir usuario"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--red)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function UserForm({ user, onSuccess, onCancel }: { user?: UserData; onSuccess: () => void; onCancel: () => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "OPERATIONAL">(user?.role ?? "OPERATIONAL");
  const [operationalRole, setOperationalRole] = useState(user?.operationalRole ?? "Operacoes");
  const [active, setActive] = useState(user?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch(user ? `/api/users/${user.id}` : "/api/users", {
      method: user ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role,
        operationalRole,
        ...(user ? { active } : null),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao criar usuario");
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input
        label={user ? "Nova senha" : "Senha"}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={user ? "Deixe em branco para manter" : "Minimo 6 caracteres"}
        required={!user}
      />
      <Select label="Perfil operacional" value={operationalRole} onChange={(e) => setOperationalRole(e.target.value)}>
        <option value="Founder">Founder</option>
        <option value="Operacoes">Operacoes</option>
        <option value="Design">Design</option>
        <option value="Trafego">Trafego</option>
        <option value="Social">Social</option>
        <option value="Atendimento">Atendimento</option>
      </Select>
      <Select label="Funcao" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "OPERATIONAL")}>
        <option value="OPERATIONAL">Operacional</option>
        <option value="ADMIN">Administrador</option>
      </Select>
      {user && (
        <Select label="Status" value={active ? "active" : "inactive"} onChange={(e) => setActive(e.target.value === "active")}>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </Select>
      )}

      {error && (
        <p style={{ color: "var(--red)", background: "var(--red-soft)", borderRadius: 8, padding: "9px 11px", fontSize: 12 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" size="sm" loading={loading}>
          {user ? "Salvar usuario" : "Criar usuario"}
        </Button>
      </div>
    </form>
  );
}
