import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";
import { normalizePeriod, periodRanges } from "@/lib/notifications/client-report";

export const runtime = "nodejs";

const CLOSED_QUALIFIED = ["qualificado", "negociacao", "convertido"];

// GET — métricas por atendente (dono do lead) + totais. Período via ?p=.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Passa pelo GATE do portal, como as demais rotas. Antes decidia a autorização
  // por conta própria e, por isso, ficava de fora da checagem de seção: um
  // usuário restrito a "conversas" lia os números da equipe inteira.
  const { error, portal } = await guardPortal(req, token, { section: "equipe" });
  if (error) return error;
  const me = portal.email;
  const isAdmin = portal.isAdmin;

  const conns = await prisma.waConnection.findMany({
    where: {
      clientId: portal.clientId,
      // Mesmo recorte da tela: uma gerente que acompanha três números não
      // aparece somando os seis no ranking.
      ...(portal.conexoesVisiveis ? { id: { in: portal.conexoesVisiveis } } : {}),
    },
    select: { id: true, ownerEmail: true, equipe: true },
  });
  if (conns.length === 0) return NextResponse.json({ me, isAdmin, period: "month", rows: [], team: null, unassigned: 0 });
  const connIds = conns.map((c) => c.id);
  // Número → quem atende nele. É daqui que sai a métrica individual quando cada
  // pessoa tem o próprio WhatsApp: ninguém precisa atribuir conversa na mão.
  const donoDoNumero = new Map(conns.map((c) => [c.id, c.ownerEmail]));
  const equipeDoNumero = new Map(conns.map((c) => [c.id, c.equipe]));
  // Pessoa → equipe, para rotular cada linha do ranking. Vem do número dela.
  const equipeDoEmail = new Map<string, string>();
  for (const c of conns) if (c.ownerEmail && c.equipe) equipeDoEmail.set(c.ownerEmail, c.equipe);
  const temEquipe = conns.some((c) => !!c.equipe);

  const period = normalizePeriod(new URL(req.url).searchParams.get("p"));
  const { start, end, label } = periodRanges(period);

  const [attendants, convs, replyGroups, echoGroups] = await Promise.all([
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true } }),
    prisma.waConversation.findMany({
      where: { connectionId: { in: connIds } },
      select: { connectionId: true, assignedEmail: true, assignedAt: true, createdAt: true, funnelStage: true, saleValue: true, saleConfirmedAt: true, firstResponseSec: true, firstResponseAt: true, lastInboundAt: true, lastOutboundAt: true },
    }),
    prisma.waMessage.groupBy({
      by: ["sentByEmail"],
      where: { connectionId: { in: connIds }, direction: "out", sentByEmail: { not: null }, timestamp: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    // Resposta HUMANA vinda do próprio celular (coexistência): chega como eco, sem
    // autor — `sentByEmail` nulo e `aiGenerated` falso. Sem isto, um cliente em que
    // cada pessoa atende pelo telefone mostraria zero respostas para todo mundo.
    prisma.waMessage.groupBy({
      by: ["connectionId"],
      where: { connectionId: { in: connIds }, direction: "out", sentByEmail: null, aiGenerated: false, timestamp: { gte: start, lte: end } },
      _count: { _all: true },
    }),
  ]);

  const inPeriod = (d: Date | null | undefined) => !!d && d >= start && d <= end;
  const isWaiting = (c: { lastInboundAt: Date | null; lastOutboundAt: Date | null }) => !!c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt);
  const repliesBy = new Map(replyGroups.map((g) => [g.sentByEmail as string, g._count._all]));
  // Os dois conjuntos são disjuntos (`sentByEmail` nulo vs. não-nulo), então somar
  // não conta duas vezes. Eco de número SEM dono não entra em ninguém — é assim que
  // um cliente de um número só (JR, Boqueirão) continua com os números de antes.
  const repliesPorEquipe = new Map<string, number>();
  const somarEquipe = (equipe: string | null | undefined, n: number) => {
    if (equipe) repliesPorEquipe.set(equipe, (repliesPorEquipe.get(equipe) ?? 0) + n);
  };
  for (const g of replyGroups) somarEquipe(equipeDoEmail.get(g.sentByEmail as string), g._count._all);
  for (const g of echoGroups) {
    somarEquipe(equipeDoNumero.get(g.connectionId), g._count._all);
    const dono = donoDoNumero.get(g.connectionId);
    if (!dono) continue;
    repliesBy.set(dono, (repliesBy.get(dono) ?? 0) + g._count._all);
  }

  const blank = () => ({ newLeads: 0, owned: 0, waiting: 0, qualified: 0, converted: 0, revenue: 0, frSum: 0, frN: 0 });
  type Conversa = (typeof convs)[number];
  // Uma regra só de contagem, usada pela pessoa e pela equipe. Duplicá-la seria
  // convidar os dois totais a discordarem com o tempo.
  function contar(s: ReturnType<typeof blank>, c: Conversa, virouLead: Date | null) {
    s.owned++;
    if (inPeriod(virouLead)) s.newLeads++;
    if (isWaiting(c)) s.waiting++;
    if (c.funnelStage && CLOSED_QUALIFIED.includes(c.funnelStage)) s.qualified++;
    if (c.funnelStage === "convertido" && inPeriod(c.saleConfirmedAt)) { s.converted++; s.revenue += c.saleValue ?? 0; }
    if (c.firstResponseSec != null && inPeriod(c.firstResponseAt)) { s.frSum += c.firstResponseSec; s.frN++; }
  }
  const acc = new Map<string, ReturnType<typeof blank>>();
  for (const a of attendants) acc.set(a.email, blank());
  let unassigned = 0;

  // DUAS FORMAS DE TER DONO, nesta ordem:
  //  1. Atribuição manual — decisão explícita de alguém, num número compartilhado
  //     por várias vendedoras (JR). Vale mais, justamente por ser deliberada.
  //  2. Dono do NÚMERO — o caso de um WhatsApp por pessoa (Jardim do Lago). Não
  //     exige atribuir nada: quem atende naquele número é dono da conversa.
  // Sem a segunda, um cliente com um número por pessoa veria TUDO como "sem
  // responsável" e as métricas individuais nasceriam vazias.
  const equipes = new Map<string, ReturnType<typeof blank>>();
  for (const c of convs) {
    // Quando a conversa virou lead DESTA pessoa: a atribuição manual, se houve;
    // senão a abertura da conversa, porque num número por pessoa não existe o
    // momento de "assumir" — a conversa já nasce dela.
    const virouLead = c.assignedEmail ? c.assignedAt : c.createdAt;

    const equipe = equipeDoNumero.get(c.connectionId) ?? null;
    if (equipe) {
      const e = equipes.get(equipe) ?? blank();
      if (!equipes.has(equipe)) equipes.set(equipe, e);
      contar(e, c, virouLead);
    }

    const dono = c.assignedEmail ?? donoDoNumero.get(c.connectionId) ?? null;
    if (!dono) { if (isWaiting(c)) unassigned++; continue; }
    const s = acc.get(dono) ?? blank();
    if (!acc.has(dono)) acc.set(dono, s); // dono que não está mais na lista de atendentes
    contar(s, c, virouLead);
  }

  const nameOf = (email: string) => attendants.find((a) => a.email === email)?.name || email.split("@")[0];
  const rows = [...acc.entries()].map(([email, s]) => ({
    email, name: nameOf(email), isMe: email === me, equipe: equipeDoEmail.get(email) ?? null,
    newLeads: s.newLeads, owned: s.owned, waiting: s.waiting, qualified: s.qualified,
    converted: s.converted, revenue: Math.round(s.revenue),
    replies: repliesBy.get(email) ?? 0,
    avgFirstResponseSec: s.frN ? Math.round(s.frSum / s.frN) : null,
  })).sort((a, b) => b.converted - a.converted || b.revenue - a.revenue || b.replies - a.replies);

  const team = rows.reduce((t, r) => ({
    newLeads: t.newLeads + r.newLeads, owned: t.owned + r.owned, waiting: t.waiting + r.waiting,
    qualified: t.qualified + r.qualified, converted: t.converted + r.converted, revenue: t.revenue + r.revenue, replies: t.replies + r.replies,
  }), { newLeads: 0, owned: 0, waiting: 0, qualified: 0, converted: 0, revenue: 0, replies: 0 });

  // Totais por EQUIPE (consultoria, captação…). `null` quando o cliente não separa
  // os números em equipes — é o caso de todo mundo hoje, e a tela não muda por isso.
  const teams = temEquipe
    ? [...equipes.entries()].map(([nome, s]) => ({
        equipe: nome, newLeads: s.newLeads, owned: s.owned, waiting: s.waiting,
        qualified: s.qualified, converted: s.converted, revenue: Math.round(s.revenue),
        replies: repliesPorEquipe.get(nome) ?? 0,
        avgFirstResponseSec: s.frN ? Math.round(s.frSum / s.frN) : null,
      })).sort((a, b) => b.converted - a.converted || b.revenue - a.revenue || a.equipe.localeCompare(b.equipe))
    : null;

  // Atendente só enxerga os PRÓPRIOS números; admin vê o ranking inteiro + totais.
  if (!isAdmin) {
    return NextResponse.json({ me, isAdmin, period, periodLabel: label, rows: rows.filter((r) => r.isMe), team: null, teams: null, unassigned: 0 });
  }
  return NextResponse.json({ me, isAdmin, period, periodLabel: label, rows, team, teams, unassigned });
}
