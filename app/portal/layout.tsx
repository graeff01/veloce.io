// Layout raiz do portal — sem verificação de auth aqui.
// Cada página protegida faz a verificação client-side via /api/portal/v1/auth/me.
// A página /portal/login é standalone e não precisa de guard.
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#080D1E",
        fontFamily: "'Inter Tight', 'Inter', sans-serif",
        color: "rgba(255,255,255,0.87)",
      }}
    >
      {children}
    </div>
  );
}
