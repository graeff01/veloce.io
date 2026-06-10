// Layout raiz do portal — mesmo design system do Veloce.io (tema claro).
// Sem verificação de auth aqui: cada página protegida valida via /auth/me.
// A página /portal/login é standalone.
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(circle at top left, rgba(79,70,229,0.06), transparent 34rem), var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes portalRise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .portal-rise { opacity: 0; animation: portalRise 460ms cubic-bezier(0.2,0.8,0.2,1) forwards; }
      `}</style>
      {children}
    </div>
  );
}
