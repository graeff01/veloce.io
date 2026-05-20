"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle2,
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
  active: boolean;
  createdAt: string;
}

export function SettingsContent() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserOpen, setNewUserOpen] = useState(false);
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

  async function deleteUser(user: UserData) {
    if (user.id === session?.user.id) return;
    if (!confirm(`Tem certeza que deseja excluir ${user.name}?`)) return;
    await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    load();
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
              gridTemplateColumns: "minmax(280px, 1.6fr) 180px 140px 108px",
              gap: 16,
              alignItems: "center",
              padding: "10px 16px",
              background: "var(--bg-base)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {["Usuario", "Funcao", "Status", "Acoes"].map((header) => (
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
              Nenhum usuario encontrado.
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
                  onToggleActive={toggleActive}
                  onDelete={deleteUser}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={newUserOpen} onClose={() => setNewUserOpen(false)} title="Novo usuario" size="sm">
        <NewUserForm
          onSuccess={() => { setNewUserOpen(false); load(); }}
          onCancel={() => setNewUserOpen(false)}
        />
      </Modal>
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

function UserRow({
  user,
  currentUserId,
  last,
  onRoleChange,
  onToggleActive,
  onDelete,
}: {
  user: UserData;
  currentUserId?: string;
  last: boolean;
  onRoleChange: (user: UserData, role: "ADMIN" | "OPERATIONAL") => void;
  onToggleActive: (user: UserData) => void;
  onDelete: (user: UserData) => void;
}) {
  const isCurrent = user.id === currentUserId;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1.6fr) 180px 140px 108px",
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

function NewUserForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "OPERATIONAL">("OPERATIONAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
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
      <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimo 6 caracteres" required />
      <Select label="Funcao" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "OPERATIONAL")}>
        <option value="OPERATIONAL">Operacional</option>
        <option value="ADMIN">Administrador</option>
      </Select>

      {error && (
        <p style={{ color: "var(--red)", background: "var(--red-soft)", borderRadius: 8, padding: "9px 11px", fontSize: 12 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" size="sm" loading={loading}>Criar usuario</Button>
      </div>
    </form>
  );
}
