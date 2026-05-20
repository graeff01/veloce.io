"use client";

import { cn } from "@/lib/utils";
import { forwardRef, ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   "text-white border-transparent shadow-sm hover:brightness-[0.98]",
  secondary: "border hover:bg-[var(--bg-hover)] text-[var(--text-primary)] bg-[var(--bg-surface)]",
  ghost:     "border-transparent hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
  danger:    "border-transparent text-[var(--red)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 text-xs rounded-lg min-h-8",
  md: "px-4 text-sm rounded-lg min-h-10",
  lg: "px-5 text-sm rounded-lg min-h-11",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium border leading-none transition-[background,color,border-color,filter] disabled:opacity-50 disabled:cursor-not-allowed",
          "border-[var(--border)]",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        style={variant === "primary" ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
