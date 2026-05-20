"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Shield, User, CheckCircle, XCircle, Trash2 } from "lucide-react";
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

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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
    <div className="flex-1 overflow-y-auto">
      <div className="px-7 pt-7 pb-5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Configurações</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>Gerenciamento de usuários e acessos</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setNewUserOpen(true)}>
          <Plus size={13} /> Novo Usuário
        </Button>
      </div>

      <div className="px-7 py-6">
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {/* Table header */}
          <div
            className="grid grid-cols-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ background: "var(--bg-surface)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
          >
            <span className="col-span-2">Usuário</span>
            <span>Função</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>

          {loading ? (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>Carregando...</div>
          ) : (
            <div style={{ background: "var(--bg-surface)" }}>
              {users.map((user, i) => (
                <div
                  key={user.id}
                  className="grid grid-cols-5 px-5 py-4 items-center"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  {/* User info */}
                  <div className="col-span-2 flex items-center gap-3">
                    <Avatar name={user.name} size="sm" />
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {user.name}
                        {user.id === session?.user.id && (
                          <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>(você)</span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{user.email}</p>
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    {user.id !== session?.user.id ? (
                      <select
                        value={user.role}
                        onChange={(e) => changeRole(user, e.target.value as "ADMIN" | "OPERATIONAL")}
                        className="px-2 py-1 rounded-lg text-xs border focus:outline-none"
                        style={{ background: "var(--bg-elevated)", borderColor: "var(--border-strong)", color: "var(--text-secondary)" }}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="OPERATIONAL">Operacional</option>
                      </select>
                    ) : (
                      <Badge variant={user.role === "ADMIN" ? "purple" : "blue"}>
                        {user.role === "ADMIN" ? (
                          <><Shield size={9} className="mr-1" /> Admin</>
                        ) : (
                          <><User size={9} className="mr-1" /> Operacional</>
                        )}
                      </Badge>
                    )}
                  </div>

                  {/* Active status */}
                  <div>
                    <Badge variant={user.active ? "green" : "gray"}>
                      {user.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    {user.id !== session?.user.id && (
                      <>
                        <button
                          onClick={() => toggleActive(user)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                          title={user.active ? "Desativar" : "Ativar"}
                          style={{ color: user.active ? "var(--accent-amber)" : "var(--accent-green)" }}
                        >
                          {user.active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                          title="Excluir usuário"
                          style={{ color: "var(--accent-red)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={newUserOpen} onClose={() => setNewUserOpen(false)} title="Novo Usuário" size="sm">
        <NewUserForm
          onSuccess={() => { setNewUserOpen(false); load(); }}
          onCancel={() => setNewUserOpen(false)}
        />
      </Modal>
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
      setError(data.error ?? "Erro ao criar usuário");
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input label="Nome *" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input label="Senha *" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required />
      <Select label="Função" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "OPERATIONAL")}>
        <option value="OPERATIONAL">Operacional</option>
        <option value="ADMIN">Administrador</option>
      </Select>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--accent-red)", background: "rgba(239,68,68,0.1)" }}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" size="sm" loading={loading}>Criar Usuário</Button>
      </div>
    </form>
  );
}
