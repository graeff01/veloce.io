"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, Search, Users, AlertTriangle, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ClientStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/clients/client-form";
import { Modal } from "@/components/ui/modal";

interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: "ACTIVE" | "INACTIVE" | "PAUSED";
  stats: {
    monthTasks: number;
    doneTasks: number;
    overdueTasks: number;
    completionRate: number;
    daysSinceActivity: number | null;
  };
}

export function ClientsContent() {
  const { data: session } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);

  async function loadClients() {
    const res = await fetch("/api/clients");
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadClients(); }, []);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = session?.user.role === "ADMIN";
  const activeCount = clients.filter((c) => c.status === "ACTIVE").length;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>

      {/* ── Header ──────────────────────────────────── */}
      <div
        style={{
          padding: "24px 32px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>
            Clientes
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {activeCount} cliente{activeCount !== 1 ? "s" : ""} ativo{activeCount !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={() => setShowNewModal(true)}>
            <Plus size={13} /> Novo cliente
          </Button>
        )}
      </div>

      <div style={{ padding: "24px 32px" }}>

        {/* ── Search bar ──────────────────────────── */}
        <div style={{ position: "relative", maxWidth: 300, marginBottom: 20 }}>
          <Search
            size={13}
            style={{
              color: "var(--text-muted)",
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 8,
              fontSize: 13,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              outline: "none",
              transition: "border-color 150ms ease-out",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
          />
        </div>

        {/* ── Content ─────────────────────────────── */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 64,
                  borderRadius: 10,
                  background: "var(--bg-surface)",
                  animation: "pulse 1.5s infinite",
                }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "72px 20px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "var(--bg-elevated)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Users size={24} style={{ color: "var(--text-muted)", opacity: 0.5 }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
              {search ? "Nenhum sinal encontrado" : "Carteira ainda sem clientes"}
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              {search
                ? `Nada na operacao corresponde a "${search}"`
                : "Adicione a primeira conta para criar ritmo operacional"}
            </p>
            {!search && isAdmin && (
              <Button variant="primary" size="sm" onClick={() => setShowNewModal(true)}>
                <Plus size={12} /> Adicionar cliente
              </Button>
            )}
          </div>
        ) : (
          /* Client table */
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "var(--shadow-card)",
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 120px 160px 80px 80px 32px",
                alignItems: "center",
                padding: "10px 20px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                gap: 12,
              }}
            >
              {["Cliente", "Status", "Progresso", "Atraso", "Tarefas", ""].map((h) => (
                <span
                  key={h}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Client rows */}
            {filtered.map((client, i) => (
              <ClientRow
                key={client.id}
                client={client}
                last={i === filtered.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Setup operacional do cliente"
        size="xl"
        variant="drawer"
      >
        <ClientForm
          onSuccess={() => { setShowNewModal(false); loadClients(); }}
          onCancel={() => setShowNewModal(false)}
        />
      </Modal>
    </div>
  );
}

/* ─── Client Row ─────────────────────────────────────── */
function ClientRow({ client, last }: { client: Client; last: boolean }) {
  const health =
    client.stats.overdueTasks > 2 ? "critical"
    : client.stats.overdueTasks > 0 || (client.stats.daysSinceActivity ?? 0) >= 7 ? "warning"
    : "good";

  const healthColor = {
    critical: "var(--red)",
    warning:  "var(--amber)",
    good:     "var(--green)",
  }[health];

  return (
    <Link href={`/clients/${client.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 120px 160px 80px 80px 32px",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          borderBottom: last ? "none" : "1px solid var(--border)",
          transition: "background 150ms ease-out",
          cursor: "pointer",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "transparent")
        }
      >
        {/* Client name + email */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar name={client.name} size="sm" />
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: "18px",
              }}
            >
              {client.name}
            </p>
            {client.email && (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: "15px",
                }}
              >
                {client.email}
              </p>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div>
          <ClientStatusBadge status={client.status} />
        </div>

        {/* Progress bar + % */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: "var(--bg-elevated)",
              overflow: "hidden",
              maxWidth: 100,
            }}
          >
            <div
              style={{
                width: `${client.stats.completionRate}%`,
                height: "100%",
                background: healthColor,
                borderRadius: 2,
                transition: "width 400ms ease-out",
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
            {client.stats.completionRate}%
          </span>
        </div>

        {/* Overdue */}
        <div>
          {client.stats.overdueTasks > 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--red)",
                background: "var(--red-soft)",
                padding: "2px 8px",
                borderRadius: 20,
                whiteSpace: "nowrap",
              }}
            >
              <AlertTriangle size={9} />
              {client.stats.overdueTasks}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
          )}
        </div>

        {/* Tasks count */}
        <div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {client.stats.doneTasks}/{client.stats.monthTasks}
          </span>
        </div>

        {/* Arrow */}
        <div>
          <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
        </div>
      </div>
    </Link>
  );
}
