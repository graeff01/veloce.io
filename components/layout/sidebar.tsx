"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  BookOpen,
  Settings,
  LogOut,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

interface ClientRow {
  id: string;
  name: string;
  status: string;
  overdue: number;
}

const bottomNavItems = [
  { href: "/",         icon: LayoutDashboard, label: "Dashboard" },
  { href: "/plans",    icon: BookOpen,        label: "Planos" },
];

const adminNavItems = [
  { href: "/settings", icon: Settings, label: "Configurações" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [clients, setClients] = useState<ClientRow[]>([]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ id: string; name: string; status: string; stats?: { overdueTasks?: number } }>) => {
        setClients(
          data
            .filter((c) => c.status === "ACTIVE")
            .map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              overdue: c.stats?.overdueTasks ?? 0,
            }))
        );
      })
      .catch(() => {});
  }, []);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function isClientActive(id: string) {
    return pathname.startsWith(`/clients/${id}`);
  }

  const firstName = session?.user.name?.split(" ")[0] ?? "";
  const role = session?.user.role === "ADMIN" ? "Administrador" : "Operacional";

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: 240,
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Zone 1 — Logo */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Zap size={13} color="white" fill="white" />
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            veloce
            <span style={{ color: "var(--accent)" }}>.io</span>
          </span>
        </Link>
      </div>

      {/* Zone 2 — Client list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 0",
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            padding: "0 16px",
            marginBottom: 6,
          }}
        >
          Clientes
        </p>
        {clients.map((client) => {
          const active = isClientActive(client.id);
          return (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              style={{ textDecoration: "none", display: "block" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 16px 7px 13px",
                  borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                  background: active ? "var(--bg-hover)" : "transparent",
                  transition: "background 150ms ease-out, border-color 150ms ease-out",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }
                }}
              >
                <ClientAvatar name={client.name} active={active} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 500 : 400,
                      color: active ? "var(--accent)" : "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      lineHeight: "18px",
                      transition: "color 150ms ease-out",
                    }}
                  >
                    {client.name}
                  </p>
                  {client.overdue > 0 && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--red)",
                        lineHeight: "14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <AlertTriangle size={9} color="var(--red)" />
                      {client.overdue} atraso
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        {clients.length === 0 && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "8px 16px",
            }}
          >
            Nenhum cliente ativo
          </p>
        )}
      </div>

      {/* Zone 3 — Bottom nav + user */}
      <div style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        {/* Bottom nav items */}
        <div style={{ padding: "10px 8px 4px" }}>
          {bottomNavItems.map((item) => (
            <BottomNavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
          {session?.user.role === "ADMIN" &&
            adminNavItems.map((item) => (
              <BottomNavItem key={item.href} {...item} active={isActive(item.href)} />
            ))
          }
        </div>

        {/* User footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderTop: "1px solid var(--border)",
          }}
        >
          {session?.user.name && (
            <Avatar name={session.user.name} size="sm" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {firstName}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{role}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sair"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              transition: "color 150ms ease-out",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--red)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)")}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function ClientAvatar({ name, active }: { name: string; active: boolean }) {
  const colors = [
    "#7C3AED", "#3B82F6", "#10B981", "#F59E0B",
    "#EF4444", "#EC4899", "#06B6D4", "#8B5CF6",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  const bg = colors[idx];
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: active ? "var(--accent)" : bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
        transition: "background 150ms ease-out",
      }}
    >
      {initials}
    </div>
  );
}

function BottomNavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          borderRadius: 8,
          marginBottom: 2,
          background: active ? "var(--accent-soft)" : "transparent",
          color: active ? "var(--accent)" : "var(--text-secondary)",
          fontSize: 13,
          fontWeight: active ? 500 : 400,
          transition: "background 150ms ease-out, color 150ms ease-out",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLDivElement).style.background = "transparent";
          }
        }}
      >
        <Icon size={15} />
        <span>{label}</span>
      </div>
    </Link>
  );
}
