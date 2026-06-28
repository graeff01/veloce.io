// Skeleton mostrado enquanto o painel (server component, dinâmico) carrega — evita
// "tela branca". Neutro (não conhece o tema ainda); some assim que a página resolve.
export default function PortalLoading() {
  const block = (h: number, w: string = "100%", r = 12) => (
    <div style={{ height: h, width: w, borderRadius: r, background: "#e9ecf1", animation: "ppulse 1.4s ease-in-out infinite" }} />
  );
  return (
    <main style={{ minHeight: "100dvh", background: "#f6f7f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`@keyframes ppulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      {/* topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8ebf0", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e9ecf1" }} />
        {block(16, "160px", 6)}
        <div style={{ flex: 1 }} />
        {block(30, "150px", 9)}
      </div>
      {/* conteúdo */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {block(56, "70%", 8)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {block(96)}{block(96)}{block(96)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {block(120)}{block(120)}
        </div>
        {block(150)}
      </div>
    </main>
  );
}
