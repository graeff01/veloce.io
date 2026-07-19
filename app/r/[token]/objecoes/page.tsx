import { prisma } from "@/lib/prisma";
import { resolvePortal, effectiveSections, getPortalShellData } from "@/lib/notifications/client-portal";
import { redirect } from "next/navigation";
import { buildLeadInsights } from "@/lib/ai-agent/insights";
import { themeStyle, themeSwitchCss, themeInitScript, PORTAL_UI_CSS } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const int = (v: number) => v.toLocaleString("pt-BR");

// Tradução + orientação por tipo de objeção (o "o que fazer" é o que vende o painel).
const OBJ: Record<string, { label: string; emoji: string; tip: string }> = {
  PRICE: { label: "Preço / achou caro", emoji: "💰", tip: "Ancore no valor (durabilidade, tamanho, parcelamento) em vez de baixar preço. Mostre o custo por ano de uso." },
  TIMING: { label: "Momento / “vou pensar”", emoji: "⏳", tip: "Facilite a decisão: próximos passos claros e uma condição com prazo. Combine um retorno." },
  FINANCING: { label: "Pagamento / parcelamento", emoji: "💳", tip: "Deixe as formas de pagamento e o parcelamento claros LOGO no começo — evita a objeção depois." },
  FIT: { label: "Medidas / não serve", emoji: "📐", tip: "Colete o espaço (medidas) ANTES de orçar e ofereça o modelo que cabe. Menos retrabalho." },
  LOCATION: { label: "Frete / localização", emoji: "📍", tip: "Confirme a cidade cedo e deixe o frete transparente. Some ao valor sem surpresa no fim." },
  COMPETITOR: { label: "Concorrente", emoji: "⚔️", tip: "Reforce os diferenciais: fábrica própria, garantia, instalação inclusa, prova de obras entregues." },
  TRUST: { label: "Confiança / procedência", emoji: "🛡️", tip: "Prova social: fotos de instalações, avaliações, garantia por escrito. Reduz o medo de comprar." },
  AUTHORITY: { label: "Quem decide (cônjuge/sócio)", emoji: "👥", tip: "Ajude a levar a proposta pra quem decide: mande o orçamento em PDF e um resumo curto." },
  URGENCY: { label: "Sem pressa", emoji: "🐢", tip: "Nutra o lead e re-engaje; crie uma urgência real (agenda de instalação, condição do mês)." },
  OTHER: { label: "Outros", emoji: "•", tip: "Motivos variados — vale ler as conversas pra achar padrões novos." },
};

export default async function ObjecoesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);

  if (!portal) {
    return (
      <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#101319", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1></div>
      </main>
    );
  }

  const sessionEmail = await getPortalSessionEmail(portal.clientId);
  if (!(await effectiveSections(portal.clientId, sessionEmail)).includes("objecoes")) redirect(`/r/${token}/conversas`);
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });
  const shell = await getPortalShellData(portal.clientId);

  if ((await isProtected(portal.clientId)) && !sessionEmail) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} />
      </main>
    );
  }

  const data = await buildLeadInsights(portal.clientId, 90);
  const objections = data.objections.filter((o) => o.total > 0).slice(0, 8);
  const totalObj = objections.reduce((s, o) => s + o.total, 0);
  const top = objections[0];
  const maxCount = Math.max(1, ...objections.map((o) => o.total));
  const labelOf = (t: string) => OBJ[t] ?? { label: t, emoji: "•", tip: "" };

  return (
    <main className="imain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="objecoes" sections={shell.sections} account={shell.account} aiTest={shell.aiTest} quotesEnabled={shell.quotesEnabled} />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} ${PORTAL_UI_CSS} *{box-sizing:border-box}
        .imain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;background:var(--p-bg)}
        @media(min-width:1024px){ .imain{margin-left:236px} }
        .ptop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:14px 26px;border-bottom:1px solid var(--p-border);background:color-mix(in srgb,var(--p-bg) 82%,transparent);backdrop-filter:saturate(180%) blur(12px)}
        .ptop h1{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0}
        .ptop .sub{color:var(--p-muted);font-size:12.5px}
        .p-track{height:8px;border-radius:5px;background:var(--p-raise);overflow:hidden}
        .p-track>span{display:block;height:100%;border-radius:5px}`}</style>

      <div className="ptop">
        <div><h1>Por que você perde venda</h1><div className="sub">Objeções detectadas pela IA nas conversas · últimos 90 dias</div></div>
      </div>

      <div className="p-wrap">
        {objections.length === 0 ? (
          <div className="p-panel">
            <div className="p-phead"><h2>Objeções dos leads</h2></div>
            <p style={{ padding: "14px 18px", fontSize: 14.5, lineHeight: 1.55, color: "var(--p-muted)", margin: 0 }}>Assim que a IA analisar suas conversas, os motivos que mais derrubam venda aparecem aqui — com o que fazer em cada um.</p>
          </div>
        ) : (
          <>
            {/* Resumo */}
            <div className="p-panel">
              <div className="p-phead"><h2>Resumo</h2><span className="hint">{int(totalObj)} objeções · {int(data.messagesAnalyzed)} mensagens analisadas</span></div>
              <p style={{ padding: "14px 18px", fontSize: 14.5, lineHeight: 1.55, color: "var(--p-text)", margin: 0 }}>
                O que mais derruba sua venda é <b>{labelOf(top.type).label.toLowerCase()}</b> — apareceu em <b>{int(top.total)}</b> conversa{top.total !== 1 ? "s" : ""}
                {top.total > 0 ? `, com ${top.resolutionRate}% contornadas pela equipe/IA` : ""}. Abaixo, os motivos em ordem e o que fazer em cada um.
              </p>
            </div>

            {/* Métricas topo */}
            <div className="p-panel">
              <div className="p-metrics" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                <div className="p-metric"><div className="k">Objeção nº 1</div><div className="v" style={{ fontSize: 20 }}>{labelOf(top.type).emoji} {labelOf(top.type).label}</div></div>
                <div className="p-metric"><div className="k">Total de objeções</div><div className="v">{int(totalObj)}</div><div className="foot">nos últimos 90 dias</div></div>
                <div className="p-metric"><div className="k">Leads esfriando</div><div className="v" style={{ color: data.dropRiskLeads > 0 ? "var(--p-warn)" : "var(--p-good)" }}>{int(data.dropRiskLeads)}</div><div className="foot">risco de perder — priorize</div></div>
              </div>
            </div>

            {/* Ranking de objeções + o que fazer */}
            <div className="p-panel">
              <div className="p-phead"><h2>Ranking de objeções</h2><span className="hint">quanto maior a barra, mais derruba venda</span></div>
              <div style={{ padding: "6px 18px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
                {objections.map((o) => {
                  const info = labelOf(o.type);
                  return (
                    <div key={o.type}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--p-text)" }}>{info.emoji} {info.label}</span>
                        <span className="tnum" style={{ fontSize: 12, color: "var(--p-muted)", flexShrink: 0 }}>{int(o.total)} conversa{o.total !== 1 ? "s" : ""} · {o.resolutionRate}% contornada{o.resolutionRate !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="p-track"><span style={{ width: `${(o.total / maxCount) * 100}%`, background: o.resolutionRate >= 60 ? "var(--p-good)" : o.resolutionRate >= 30 ? "var(--p-warn)" : "var(--p-crit)" }} /></div>
                      {info.tip && <div style={{ display: "flex", gap: 6, marginTop: 7, fontSize: 12, color: "var(--p-muted)", lineHeight: 1.45 }}><b style={{ color: "var(--p-accent)", flexShrink: 0 }}>O que fazer:</b><span>{info.tip}</span></div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <p style={{ fontSize: 12, color: "var(--p-muted)", opacity: 0.9, lineHeight: 1.5, padding: "0 2px" }}>
              <b style={{ color: "var(--p-text)" }}>Como isso é gerado</b> — a IA lê cada conversa e classifica a objeção que o lead levantou (preço, momento, frete…). Aqui você vê o padrão e ataca a causa raiz das vendas perdidas.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
