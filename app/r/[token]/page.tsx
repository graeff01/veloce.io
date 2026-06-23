import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getClientDashboard } from "@/lib/notifications/client-report";
import { buildTheme, type Theme } from "@/lib/portal-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");

function Card({ t, children, span }: { t: Theme; children: React.ReactNode; span?: number }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, padding: 18, gridColumn: span ? `span ${span}` : undefined }}>
      {children}
    </div>
  );
}

function Kpi({ t, label, value, sub }: { t: Theme; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card t={t}>
      <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: t.text, lineHeight: 1.1, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: t.muted, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);

  if (!portal) {
    const t = buildTheme(null, "light");
    return (
      <main style={{ minHeight: "100vh", background: t.bg, color: t.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1>
          <p style={{ color: t.muted, marginTop: 6, fontSize: 14 }}>Este painel foi desativado ou o link expirou. Peça um novo à sua agência.</p>
        </div>
      </main>
    );
  }

  const [client, bot, data] = await Promise.all([
    prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } }),
    prisma.clientBot.findUnique({ where: { clientId: portal.clientId }, select: { brandName: true } }),
    getClientDashboard(portal.clientId),
  ]);

  const t = buildTheme(portal.accentColor, portal.mode);
  const brandName = (bot?.brandName || "").trim() || client?.name || "Painel";
  const a = data.atendimento;
  const term = data.termometro;
  const atualizado = new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const deltaTxt = a.deltaPct == null ? null : `${a.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(a.deltaPct)}% vs. mês passado`;
  const deltaColor = a.deltaPct == null ? t.muted : a.deltaPct >= 0 ? "#1aa35a" : "#d6453d";

  return (
    <main style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 48px" }}>

        {/* Cabeçalho com a marca do cliente */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          {client?.logoUrl
            ? <img src={client.logoUrl} alt={brandName} width={44} height={44} style={{ borderRadius: 12, objectFit: "cover", border: `1px solid ${t.border}` }} />
            : <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accent, color: t.onAccent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>{brandName[0]?.toUpperCase()}</div>}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{brandName}</div>
            <div style={{ fontSize: 12.5, color: t.muted }}>Painel de performance · {data.periodLabel}</div>
          </div>
        </header>

        {/* Hero KPIs */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
          <Kpi t={t} label="Leads no mês" value={int(a.leads)} sub={deltaTxt && <span style={{ color: deltaColor, fontWeight: 600 }}>{deltaTxt}</span>} />
          <Kpi t={t} label="Custo por lead" value={data.midia?.cpl != null ? brl(data.midia.cpl) : "—"} sub={data.midia ? `${int(data.midia.leads)} leads de anúncio` : "sem mídia conectada"} />
          <Kpi t={t} label="Conversões" value={int(a.conversoes)} sub="negócios sinalizados" />
          <Kpi t={t} label="Tempo de resposta" value={a.tempoMedioMin != null ? `${a.tempoMedioMin} min` : "—"} sub={`${a.taxaResposta}% respondidos`} />
        </section>

        {/* Termômetro da carteira */}
        <section style={{ marginTop: 12 }}>
          <Card t={t}>
            <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>🌡️ Aguardando atendimento agora</div>
            {term.total === 0 ? (
              <div style={{ fontSize: 14, color: t.muted }}>Nenhum lead aguardando. 👌</div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                {[{ k: "🔥 Quentes", v: term.hot, c: "#e8590c" }, { k: "🟠 Mornos", v: term.warm, c: "#e8a33d" }, { k: "🧊 Frios", v: term.cold, c: "#5b9bd5" }].map((x) => (
                  <div key={x.k} style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: t.accentSoft, borderRadius: 12 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: t.text }}>{x.v}</div>
                    <div style={{ fontSize: 11.5, color: t.muted, marginTop: 2 }}>{x.k}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Mídia */}
        {data.midia && (
          <section style={{ marginTop: 12 }}>
            <Card t={t}>
              <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>📣 Mídia no mês</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{brl(data.midia.spend)}</div><div style={{ fontSize: 11.5, color: t.muted }}>investido</div></div>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{int(data.midia.leads)}</div><div style={{ fontSize: 11.5, color: t.muted }}>leads</div></div>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{data.midia.cpl != null ? brl(data.midia.cpl) : "—"}</div><div style={{ fontSize: 11.5, color: t.muted }}>por lead</div></div>
              </div>
            </Card>
          </section>
        )}

        <footer style={{ marginTop: 24, textAlign: "center", fontSize: 11.5, color: t.muted }}>
          Atualizado em {atualizado}
        </footer>
      </div>
    </main>
  );
}
