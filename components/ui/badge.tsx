import { cn } from "@/lib/utils";
import { TaskStatus, ClientStatus } from "@prisma/client";

type BadgeVariant = "blue" | "amber" | "purple" | "green" | "red" | "orange" | "gray";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  blue:   { bg: "var(--blue-soft)",   color: "var(--blue)",   border: "rgba(59,130,246,0.25)" },
  amber:  { bg: "var(--amber-soft)",  color: "var(--amber)",  border: "rgba(245,158,11,0.25)" },
  purple: { bg: "var(--accent-soft)", color: "var(--accent)", border: "rgba(124,58,237,0.25)" },
  green:  { bg: "var(--green-soft)",  color: "var(--green)",  border: "rgba(16,185,129,0.25)" },
  red:    { bg: "var(--red-soft)",    color: "var(--red)",    border: "rgba(239,68,68,0.25)" },
  orange: { bg: "#FFF3E0",            color: "#F97316",       border: "rgba(249,115,22,0.25)" },
  gray:   { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
};

export function Badge({ children, variant = "gray", className }: BadgeProps) {
  const s = variantStyles[variant];
  return (
    <span
      className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", className)}
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {children}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, { label: string; variant: BadgeVariant }> = {
    TODO:        { label: "A Fazer",      variant: "blue" },
    IN_PROGRESS: { label: "Em Andamento", variant: "amber" },
    REVIEW:      { label: "Revisão",      variant: "purple" },
    DONE:        { label: "Concluído",    variant: "green" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const map: Record<ClientStatus, { label: string; variant: BadgeVariant }> = {
    ACTIVE:   { label: "Ativo",   variant: "green" },
    INACTIVE: { label: "Inativo", variant: "gray" },
    PAUSED:   { label: "Pausado", variant: "amber" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
