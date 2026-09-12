import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";
import { normalizePeriod, periodRanges } from "@/lib/notifications/client-report";

export const runtime = "nodejs";

// ── O que a gestora precisa DECIDIR ──────────────────────────────────────────
// A tela de Equipe mostrava convertidos, receita e qualificados — as mesmas
// coisas do Funil, ditas de outro jeito. Aqui ficou só o que ela age em cima:
// quanto tempo o lead espera, quem está travado, e o que fazer a respeito.
//
// Conversão e receita continuam existindo: no Funil, que é onde essa pergunta
// mora. Repetir número em duas telas não informa duas vezes — faz duvidar de
// qual das duas está certa.
//
// `team-metrics` continua como está: o aplicativo consome aquele formato.

const MAX_MENSAGENS = 20_000; // teto do cálculo de tempo de resposta

/** Mediana, não média: um lead respondido em três dias não pode definir o time. */
function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : Math.round((o[m - 1]! + o[m]!) / 2);
}

interface Acc {
  leads: number;
  esperando: number;
  esperaMaxMin: number;
  semResposta: number;
  primeiras: number[];
  respostas: number[];
}
const vazio = (): Acc => ({ leads: 0, esperando: 0, esperaMaxMin: 0, semResposta: 0, primeiras: [], respostas: [] });

export interface Gargalo {
  tipo: "sem_resposta" | "espera_longa" | "primeira_resposta_lenta" | "fila_concentrada";
  gravidade: "alta" | "media";
  titulo: string;
  detalhe: string;
  pessoa?: string;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "equipe" });
  if (error) return error;

  const period = normalizePeriod(new URL(req.url).searchParams.get("p"));
  const { start, end, label } = periodRanges(period);
  const agora = Date.now();

  const conns = await prisma.waConnection.findMany({
    where: { clientId: portal.clientId },
    select: { id: true, name: true, displayPhone: true, ownerEmail: true, equipe: true },
  });
  if (conns.length === 0) {
    return NextResponse.json({ periodLabel: label, pessoas: [], equipes: null, equipe: null, gargalos: [] });
  }
  const connIds = conns.map((c) => c.id);
  const donoDoNumero = new Map(conns.map((c) => [c.id, c.ownerEmail]));
  const equipeDoNumero = new Map(conns.map((c) => [c.id, c.equipe]));
  const nomeDoNumero = new Map(conns.map((c) => [c.id, c.name || c.displayPhone || "Número"]));

  const [convs, atendentes] = await Promise.all([
    prisma.waConversation.findMany({
      where: { connectionId: { in: connIds } },
      select: {
        contactId: true, connectionId: true, assignedEmail: true,
        firstInboundAt: true, firstResponseAt: true, firstResponseSec: true,
        lastInboundAt: true, lastOutboundAt: true,
      },
    }),
    prisma.portalAccess.findMany({
      where: { clientId: portal.clientId }, select: { email: true, name: true },
    }),
  ]);

  // Mensagens do período, só o necessário para medir o vai-e-vem. Teto explícito:
  // esta tela não pode ficar cara quando a operação crescer.
  const msgs = await prisma.waMessage.findMany({
    where: { connectionId: { in: connIds }, timestamp: { gte: start, lte: end } },
    select: { contactId: true, direction: true, timestamp: true },
    orderBy: [{ contactId: "asc" }, { timestamp: "asc" }],
    take: MAX_MENSAGENS,
  });

  // TEMPO DE RESPOSTA: quanto a equipe demora para voltar DEPOIS da primeira
  // resposta — o lead que fica esperando no meio da conversa, não na porta.
  const respostaPorContato = new Map<string, number[]>();
  let atual: string | null = null;
  let esperandoDesde: number | null = null;
  for (const m of msgs) {
    if (m.contactId !== atual) { atual = m.contactId; esperandoDesde = null; }
    if (m.direction === "in") {
      // Só a PRIMEIRA de uma sequência do lead conta: quem escreve em três
      // partes não esperou três vezes.
      if (esperandoDesde == null) esperandoDesde = m.timestamp.getTime();
    } else if (esperandoDesde != null) {
      const s = Math.round((m.timestamp.getTime() - esperandoDesde) / 1000);
      const arr = respostaPorContato.get(m.contactId) ?? [];
      arr.push(s);
      respostaPorContato.set(m.contactId, arr);
      esperandoDesde = null;
    }
  }

  const noPeriodo = (d: Date | null) => !!d && d >= start && d <= end;
  const porPessoa = new Map<string, Acc>();
  const porEquipe = new Map<string, Acc>();
  // Fila por NÚMERO também: é o que permite dizer "a fila está concentrada".
  const filaPorNumero = new Map<string, number>();

  for (const c of convs) {
    const dono = c.assignedEmail ?? donoDoNumero.get(c.connectionId) ?? null;
    const equipe = equipeDoNumero.get(c.connectionId) ?? null;
    const esperando = !!c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt);
    const esperaMin = esperando && c.lastInboundAt
      ? Math.round((agora - c.lastInboundAt.getTime()) / 60_000) : 0;
    // Nunca respondida: o lead falou e não saiu NADA. É o pior caso — não é
    // demora, é ausência.
    const semResposta = !!c.lastInboundAt && !c.lastOutboundAt;

    const alvos: Acc[] = [];
    if (dono) {
      const a = porPessoa.get(dono) ?? vazio();
      porPessoa.set(dono, a); alvos.push(a);
    }
    if (equipe) {
      const a = porEquipe.get(equipe) ?? vazio();
      porEquipe.set(equipe, a); alvos.push(a);
    }
    if (esperando) filaPorNumero.set(c.connectionId, (filaPorNumero.get(c.connectionId) ?? 0) + 1);

    for (const a of alvos) {
      if (noPeriodo(c.firstInboundAt)) a.leads++;
      if (esperando) { a.esperando++; a.esperaMaxMin = Math.max(a.esperaMaxMin, esperaMin); }
      if (semResposta) a.semResposta++;
      if (c.firstResponseSec != null && noPeriodo(c.firstResponseAt)) a.primeiras.push(c.firstResponseSec);
      for (const s of respostaPorContato.get(c.contactId) ?? []) a.respostas.push(s);
    }
  }

  // Quem atende quase nunca tem acesso ao portal — atende pelo próprio celular.
  // Então o nome vem, nesta ordem: cadastro do portal, nome do NÚMERO (que é
  // onde o nome da pessoa costuma estar), e só então o pedaço do e-mail.
  const nomeDe = (email: string) =>
    atendentes.find((a) => a.email === email)?.name
    || conns.find((c) => c.ownerEmail === email)?.name
    || email.split("@")[0];
  const equipeDe = (email: string) =>
    conns.find((c) => c.ownerEmail === email)?.equipe ?? null;

  const resumir = (a: Acc) => ({
    leads: a.leads,
    esperando: a.esperando,
    esperaMaxMin: a.esperaMaxMin,
    semResposta: a.semResposta,
    primeiraRespostaSec: mediana(a.primeiras),
    respostaSec: mediana(a.respostas),
  });

  const pessoas = [...porPessoa.entries()]
    .map(([email, a]) => ({ email, nome: nomeDe(email), equipe: equipeDe(email), ...resumir(a) }))
    // Pior primeiro: a tela abre no que precisa de atenção, não em ordem alfabética.
    .sort((x, y) => y.semResposta - x.semResposta || y.esperaMaxMin - x.esperaMaxMin || y.esperando - x.esperando);

  const temEquipe = conns.some((c) => !!c.equipe);
  const equipes = temEquipe
    ? [...porEquipe.entries()].map(([nome, a]) => ({ equipe: nome, ...resumir(a) }))
        .sort((x, y) => y.semResposta - x.semResposta || y.esperando - x.esperando)
    : null;

  const geral = {
    leads: pessoas.reduce((n, p) => n + p.leads, 0),
    esperando: [...filaPorNumero.values()].reduce((n, v) => n + v, 0),
    semResposta: pessoas.reduce((n, p) => n + p.semResposta, 0),
    primeiraRespostaSec: mediana([...porPessoa.values()].flatMap((a) => a.primeiras)),
    respostaSec: mediana([...porPessoa.values()].flatMap((a) => a.respostas)),
  };

  // ── Gargalos ───────────────────────────────────────────────────────────────
  // Regras explícitas, não "a IA achou". Cada uma diz o que está acontecendo e
  // o que fazer — e nenhuma aparece quando não há o que apontar.
  const gargalos: Gargalo[] = [];

  const semRespostaTotal = geral.semResposta;
  if (semRespostaTotal > 0) {
    const pior = pessoas.filter((p) => p.semResposta > 0).slice(0, 3);
    gargalos.push({
      tipo: "sem_resposta", gravidade: "alta",
      titulo: `${semRespostaTotal} ${semRespostaTotal === 1 ? "lead nunca foi respondido" : "leads nunca foram respondidos"}`,
      detalhe: pior.length
        ? `Concentrado em ${pior.map((p) => `${p.nome} (${p.semResposta})`).join(", ")}. Não é demora: nada saiu para essas pessoas.`
        : "O lead escreveu e nenhuma resposta saiu.",
      pessoa: pior.length === 1 ? pior[0]!.email : undefined,
    });
  }

  const maisDeUmDia = pessoas.filter((p) => p.esperaMaxMin >= 24 * 60);
  if (maisDeUmDia.length) {
    const pior = maisDeUmDia.reduce((a, b) => (a.esperaMaxMin > b.esperaMaxMin ? a : b));
    const dias = Math.floor(pior.esperaMaxMin / (24 * 60));
    gargalos.push({
      tipo: "espera_longa", gravidade: "alta",
      titulo: `Lead esperando há ${dias === 1 ? "mais de um dia" : `${dias} dias`}`,
      detalhe: `Com ${pior.nome}. Mais ${maisDeUmDia.length - 1 > 0 ? `${maisDeUmDia.length - 1} pessoa(s) na mesma situação. ` : ""}Depois de 24h a chance de resposta cai muito — vale reabrir o contato.`,
      pessoa: pior.email,
    });
  }

  // Quem responde bem mais devagar que o resto. Duas condições juntas para não
  // apontar diferença irrelevante: proporção E diferença absoluta.
  if (geral.primeiraRespostaSec != null) {
    for (const p of pessoas) {
      if (p.primeiraRespostaSec == null) continue;
      const dif = p.primeiraRespostaSec - geral.primeiraRespostaSec;
      if (p.primeiraRespostaSec >= geral.primeiraRespostaSec * 1.5 && dif >= 300) {
        gargalos.push({
          tipo: "primeira_resposta_lenta", gravidade: "media",
          titulo: `${p.nome} demora ${Math.round(dif / 60)}min a mais para a 1ª resposta`,
          detalhe: `Mediana de ${Math.round(p.primeiraRespostaSec / 60)}min contra ${Math.round(geral.primeiraRespostaSec / 60)}min do time. A primeira resposta é a que decide se o lead continua a conversa.`,
          pessoa: p.email,
        });
      }
    }
  }

  if (geral.esperando >= 5) {
    const pior = pessoas.reduce((a, b) => (a.esperando > b.esperando ? a : b), pessoas[0] ?? null as never);
    if (pior && pior.esperando / geral.esperando >= 0.4) {
      gargalos.push({
        tipo: "fila_concentrada", gravidade: "media",
        titulo: `${Math.round((pior.esperando / geral.esperando) * 100)}% da fila está com ${pior.nome}`,
        detalhe: `${pior.esperando} de ${geral.esperando} leads aguardando. Distribuir alivia a fila sem contratar ninguém.`,
        pessoa: pior.email,
      });
    }
  }

  gargalos.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === "alta" ? -1 : 1));

  return NextResponse.json({
    periodLabel: label, period,
    geral, pessoas, equipes, gargalos,
    numeros: conns.map((c) => ({ id: c.id, nome: nomeDoNumero.get(c.id), dono: c.ownerEmail })),
  });
}
