// Header padrão das abas do cliente (mesmo modelo de WhatsApp / Anúncios / Perfil):
// barra full-bleed, ícone tonal 32px + título + subtítulo, ações à direita.
export function TabHeader({ icon, tint = "var(--accent-soft)", iconColor = "var(--accent)", title, subtitle, actions }: {
  icon: React.ReactNode; tint?: string; iconColor?: string; title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "18px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: tint, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</p>
          {subtitle && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}
