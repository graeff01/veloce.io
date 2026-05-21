import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ children, className, onClick, hoverable }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "border",
        hoverable && "cursor-pointer hover:border-[var(--border-strong)]",
        onClick && "cursor-pointer",
        className
      )}
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border)",
        borderRadius: "var(--radius-card)",
        padding: "var(--space-16)",
        boxShadow: "var(--shadow-card)",
        transition: "box-shadow var(--motion-hover) var(--ease-enter), border-color var(--motion-hover) var(--ease-enter)",
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-sm font-semibold", className)} style={{ color: "var(--text-primary)" }}>
      {children}
    </h3>
  );
}
