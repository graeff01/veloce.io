"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "center" | "drawer";
  footer?: React.ReactNode;
}

const sizeMap = {
  sm: 460,
  md: 640,
  lg: 760,
  xl: 960,
};

export function Modal({ open, onClose, title, children, size = "md", variant = "center", footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="modal-overlay-enter"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: variant === "drawer" ? "stretch" : "center",
        justifyContent: variant === "drawer" ? "flex-end" : "center",
        padding: variant === "drawer" ? "12px" : 20,
        background: "rgba(15, 23, 42, 0.46)",
        backdropFilter: "blur(10px)",
      }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className={variant === "drawer" ? "drawer-panel-enter" : "modal-panel-enter"}
        style={{
          width: "100%",
          maxWidth: sizeMap[size],
          height: variant === "drawer" ? "100%" : undefined,
          maxHeight: variant === "drawer" ? "none" : "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-surface)",
          border: "1px solid rgba(148, 163, 184, 0.28)",
          borderRadius: 14,
          boxShadow: "0 26px 80px rgba(15, 23, 42, 0.24)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "18px 20px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2 style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 650, lineHeight: "20px" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            title="Fechar"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              padding: "14px 20px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-base)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
