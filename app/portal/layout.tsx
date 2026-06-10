// Layout raiz do portal — sem verificação de auth aqui.
// Cada página protegida faz a verificação client-side via /api/portal/v1/auth/me.
// A página /portal/login é standalone e não precisa de guard.
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="portal-root"
      style={{
        minHeight: "100dvh",
        background: "#070B16",
        fontFamily: "'Inter Tight', 'Inter', sans-serif",
        color: "rgba(255,255,255,0.87)",
        position: "relative",
      }}
    >
      {/* Glow ambiente no topo — profundidade sutil, não decoração */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(900px, 100vw)",
          height: 420,
          background: "radial-gradient(ellipse at top, rgba(99,102,241,0.10) 0%, rgba(99,102,241,0.03) 45%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <style>{`
        html { scroll-behavior: smooth; }
        .portal-root ::selection { background: rgba(129,140,248,0.35); }
        .portal-section { scroll-margin-top: 84px; }
        @keyframes portalRise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .portal-rise {
          opacity: 0;
          animation: portalRise 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes portalShimmer {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
        .portal-skeleton {
          position: relative;
          overflow: hidden;
          background: rgba(255,255,255,0.045);
          border-radius: 8px;
        }
        .portal-skeleton::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
          animation: portalShimmer 1.6s ease-in-out infinite;
        }
        .portal-root input:focus {
          border-color: rgba(129,140,248,0.55) !important;
          box-shadow: 0 0 0 3px rgba(129,140,248,0.14);
        }
        .portal-anchor-link:hover { color: rgba(255,255,255,0.85) !important; }
      `}</style>
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
