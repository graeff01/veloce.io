"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const breadcrumbMap: Record<string, string> = {
  "":        "Dashboard",
  "clients": "Clientes",
  "plans":   "Planos",
  "settings":"Configurações",
  "tasks":   "Tarefas",
  "calendar":"Calendário",
  "new":     "Novo",
};

export function Header({ title, subtitle }: { title?: string; subtitle?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <header
      className="h-14 flex items-center px-6 border-b flex-shrink-0"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        <Link href="/" className="hover:text-[var(--text-secondary)] transition-colors">
          Dashboard
        </Link>
        {segments.map((seg, i) => {
          const href = "/" + segments.slice(0, i + 1).join("/");
          const isLast = i === segments.length - 1;
          const label = breadcrumbMap[seg] ?? seg;
          return (
            <span key={seg} className="flex items-center gap-1.5">
              <ChevronRight size={11} />
              {isLast ? (
                <span style={{ color: "var(--text-primary)" }}>{title ?? label}</span>
              ) : (
                <Link href={href} className="hover:text-[var(--text-secondary)] transition-colors capitalize">
                  {label}
                </Link>
              )}
            </span>
          );
        })}
      </div>

      {subtitle && (
        <p className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
    </header>
  );
}
