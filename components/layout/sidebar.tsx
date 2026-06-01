"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  LogOut,
  AlertTriangle,
  ArrowRight,
  Search,
  Plus,
  Moon,
  Sun,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

interface ClientRow {
  id: string;
  name: string;
  status: string;
  overdue: number;
}

const bottomNavItems = [
  { href: "/",          icon: LayoutDashboard, label: "Visao geral" },
  { href: "/calendar",  icon: CalendarDays,    label: "Calendario" },
  { href: "/finances",  icon: Wallet,          label: "Financas" },
];

const adminNavItems = [
  { href: "/settings", icon: Settings, label: "Configuracoes" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ id: string; name: string; status: string; stats?: { overdueTasks?: number } }>) => {
        setClients(
          data
            .filter((c) => c.status === "ACTIVE" || c.status === "PAUSED")
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

  useEffect(() => {
    const saved = localStorage.getItem("veloce-theme");
    const nextDark = saved === "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    localStorage.setItem("veloce-theme", nextDark ? "dark" : "light");
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function isClientActive(id: string) {
    return pathname.startsWith(`/clients/${id}`);
  }

  const firstName = session?.user.name?.split(" ")[0] ?? "";
  const role = session?.user.role === "ADMIN" ? "Administrador" : "Operacional";

  const activeClients = clients.filter((c) => c.status === "ACTIVE");
  const pausedClients = clients.filter((c) => c.status === "PAUSED");

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
        background: "linear-gradient(180deg, var(--bg-sidebar) 0%, var(--bg-surface) 100%)",
        borderRight: "1px solid var(--border)",
        boxShadow: "8px 0 34px rgba(0,0,0,0.10)",
      }}
    >
      {/* ── Zone 1: Logo ─────────────────────────────── */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "var(--bg-base)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 20px rgba(124,58,237,0.16)",
            }}
          >
            <Image
              src="/logo.png"
              alt="Veloce.io"
              width={30}
              height={30}
              priority
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            veloce<span style={{ color: "var(--accent)" }}>.io</span>
          </span>
        </Link>
      </div>

      {/* ── Zone 2: Client list ──────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 0",
          minHeight: 0,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 34px", gap: 6, margin: "0 12px 12px" }}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("veloce-command-open"))}
            title="Abrir Command Palette"
            style={{
              height: 34,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-base)",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Search size={13} />
              Buscar ou criar
            </span>
            <span style={{ fontSize: 10 }}>K</span>
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("veloce-command-open", { detail: { mode: "task" } }))}
            title="Criar rapido"
            style={{
              height: 34,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--accent)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(124,58,237,0.18)",
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Section label + Ver todos */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            marginBottom: 6,
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Clientes
          </p>
          <Link
            href="/clients"
            style={{
              fontSize: 10,
              color: "var(--accent)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 2,
              opacity: 0.8,
            }}
          >
            Ver todos <ArrowRight size={9} />
          </Link>
        </div>

        {/* Active clients */}
        {activeClients.map((client) => (
          <SidebarClientRow
            key={client.id}
            client={client}
            active={isClientActive(client.id)}
          />
        ))}

        {/* Paused clients (dimmed) */}
        {pausedClients.length > 0 && (
          <>
            <p
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                padding: "8px 16px 4px",
                opacity: 0.7,
              }}
            >
              Pausados
            </p>
            {pausedClients.map((client) => (
              <SidebarClientRow
                key={client.id}
                client={client}
                active={isClientActive(client.id)}
                dimmed
              />
            ))}
          </>
        )}

        {clients.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 16px" }}>
            Carteira vazia
          </p>
        )}
      </div>

      {/* ── Zone 3: Bottom nav + user ────────────────── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--border)",
        }}
      >
        {/* Bottom nav items */}
        <div style={{ padding: "10px 8px 6px" }}>
          {bottomNavItems.map((item) => (
            <BottomNavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
          {session?.user.role === "ADMIN" &&
            adminNavItems.map((item) => (
              <BottomNavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
        </div>

        {/* User footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px 12px",
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
                lineHeight: "18px",
              }}
            >
              {firstName}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: "15px" }}>{role}</p>
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
              flexShrink: 0,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--red)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)")}
          >
            <LogOut size={14} />
          </button>
          <button
            onClick={toggleTheme}
            title={dark ? "Modo claro" : "Modo escuro"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ─── Sidebar Client Row ─────────────────────────────── */
function SidebarClientRow({
  client,
  active,
  dimmed = false,
}: {
  client: ClientRow;
  active: boolean;
  dimmed?: boolean;
}) {
  const colors = [
    "#7C3AED", "#3B82F6", "#10B981", "#F59E0B",
    "#EF4444", "#EC4899", "#06B6D4", "#8B5CF6",
  ];
  const idx = client.name.charCodeAt(0) % colors.length;
  const avatarBg = active ? "var(--accent)" : colors[idx];
  const initials = client.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Link key={client.id} href={`/clients/${client.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 16px 6px 13px",
          borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
          background: active ? "linear-gradient(90deg, var(--accent-soft), transparent)" : "transparent",
          opacity: dimmed && !active ? 0.55 : 1,
          transition: "background 180ms ease-out, border-color 180ms ease-out, opacity 180ms ease-out, transform 180ms ease-out",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)";
            (e.currentTarget as HTMLDivElement).style.transform = "translateX(2px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLDivElement).style.background = "transparent";
            (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)";
          }
        }}
      >
        {/* Mini avatar */}
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: avatarBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 600,
            color: "#fff",
            flexShrink: 0,
            transition: "background 150ms ease-out",
          }}
        >
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? "var(--accent)" : "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: "17px",
              transition: "color 150ms ease-out",
            }}
          >
            {client.name}
          </p>
          {client.overdue > 0 && (
            <p
              style={{
                fontSize: 10,
                color: "var(--red)",
                lineHeight: "14px",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <AlertTriangle size={8} style={{ color: "var(--red)" }} />
              {client.overdue} em atraso
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ─── Bottom Nav Item ────────────────────────────────── */
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
          padding: "6px 10px",
          borderRadius: 7,
          marginBottom: 1,
          background: active ? "linear-gradient(90deg, var(--accent-soft), transparent)" : "transparent",
          color: active ? "var(--accent)" : "var(--text-secondary)",
          fontSize: 13,
          fontWeight: active ? 500 : 400,
          transition: "background 180ms ease-out, color 180ms ease-out, transform 180ms ease-out",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)";
            (e.currentTarget as HTMLDivElement).style.transform = "translateX(2px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLDivElement).style.background = "transparent";
            (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)";
          }
        }}
      >
        <Icon size={14} />
        <span>{label}</span>
      </div>
    </Link>
  );
}
