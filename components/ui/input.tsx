import { cn } from "@/lib/utils";
import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const inputBase = "w-full text-sm border focus:outline-none transition-[border-color,box-shadow,background] placeholder:text-[var(--text-muted)]";
const inputStyle = {
  background: "var(--bg-surface)",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-input)",
  color: "var(--text-primary)",
  minHeight: 40,
  padding: "9px var(--space-12)",
  transitionDuration: "var(--motion-hover)",
  transitionTimingFunction: "var(--ease-enter)",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
      {label && (
        <label className="text-xs font-medium" style={{ color: "var(--text-secondary)", lineHeight: "16px" }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={cn(inputBase, error && "border-red-500", className)}
        style={inputStyle}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: "var(--accent-red)" }}>{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
      {label && (
        <label className="text-xs font-medium" style={{ color: "var(--text-secondary)", lineHeight: "16px" }}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        rows={3}
        className={cn(inputBase, "resize-none", error && "border-red-500", className)}
        style={inputStyle}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: "var(--accent-red)" }}>{error}</p>}
    </div>
  )
);
Textarea.displayName = "Textarea";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, children, ...props }, ref) => (
    <div className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
      {label && (
        <label className="text-xs font-medium" style={{ color: "var(--text-secondary)", lineHeight: "16px" }}>
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={cn(inputBase, error && "border-red-500", className)}
        style={{ ...inputStyle, appearance: "auto" }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs" style={{ color: "var(--accent-red)" }}>{error}</p>}
    </div>
  )
);
Select.displayName = "Select";
