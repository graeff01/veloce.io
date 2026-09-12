import { prisma } from "@/lib/prisma";
import { normalizePeriod, periodRanges } from "@/lib/notifications/client-report";
import { numerosMudos } from "@/lib/portal/numero-mudo";
import { numerosComTokenQuebrado } from "@/lib/whatsapp-saude";
import { criarHoraLocal } from "@/lib/tz";

// ── O que a gestora precisa DECIDIR ──────────────────────────────────────────
// A tela de Equipe mostrava convertidos, receita e qualificados — as mesmas
// coisas do Funil, ditas de outro jeito. Aqui ficou só o que ela age em cima:
// quanto tempo o lead espera, quem está travado, e o que fazer a respeito.
//
// Conversão e receita continuam existindo: no Funil, que é onde essa pergunta
// mora. Repetir número em duas telas não informa duas vezes — faz duvidar de
// qual das duas está certa.

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
  tipo: "token_quebrado" | "numero_mudo" | "sem_resposta" | "espera_longa" | "primeira_resposta_lenta" | "fila_concentrada";
  gravidade: "alta" | "media";
  titulo: string;
  detalhe: string;
  pessoa?: string;
}

/**
 * Tudo o que a tela de Equipe mostra, e que os ALERTAS usam para avisar.
 *
 * Vive aqui, e não na rota, porque a tela e o aviso precisam dizer a MESMA
 * coisa. Com as regras duplicadas, uma hora o alerta diria "lead sem resposta"
 * numa tela que mostra tudo calmo — e a gestora deixaria de confiar nas duas.
 */
export async function calcularInsightsEquipe(
  clientId: string,
  periodo?: string | null,
  /** Números que esta pessoa alcança. `null` = todos os do cliente. */
  visiveis?: string[] | null,
) {
  const period = normalizePeriod(periodo ?? null);
  const { start, end, prevStart, prevEnd, label } = periodRanges(period);
  const agora = Date.now();

  const conns = await prisma.waConnection.findMany({
    // O recorte na origem: tudo abaixo — pessoas, equipes, gargalos, horários —
    // deriva daqui. Uma gerente vê o diagnóstico DELA, não o da casa.
    where: { clientId, ...(visiveis ? { id: { in: visiveis } } : {}) },
    select: { id: true, name: true, displayPhone: true, ownerEmail: true, equipe: true },
  });
  if (conns.length === 0) {
    return { periodLabel: label, period, geral: null, anterior: null, horas: [], horarioFraco: null, pessoas: [], equipes: null, gargalos: [], mudos: [], semToken: [], numeros: [] };
  }
  const connIds = conns.map((c) => c.id);
  const donoDoNumero = new Map(conns.map((c) => [c.id, c.ownerEmail]));
  const equipeDoNumero = new Map(conns.map((c) => [c.id, c.equipe]));
  const nomeDoNumero = new Map(conns.map((c) => [c.id, c.name || c.displayPhone || "Número"]));

  const [convs, atendentes, nomesDeQuemAtende, mudos, semToken] = await Promise.all([
    prisma.waConversation.findMany({
      where: { connectionId: { in: connIds } },
      select: {
        contactId: true, connectionId: true, assignedEmail: true,
        firstInboundAt: true, firstResponseAt: true, firstResponseSec: true,
        lastInboundAt: true, lastOutboundAt: true,
      },
    }),
    prisma.portalAccess.findMany({
      where: { clientId }, select: { email: true, name: true },
    }),
    // Nomes de quem atende em QUALQUER número do cliente, mesmo fora do recorte.
    // Uma conversa do número da Michele pode ter sido atribuída a alguém da
    // outra equipe — ela precisa ver isso, e ver o NOME da pessoa. Sem esta
    // lista o nome caía para o pedaço do e-mail, e só naquela linha: a tela
    // parecia quebrada exatamente onde era mais importante entender.
    prisma.waConnection.findMany({
      where: { clientId, ownerEmail: { not: null } },
      select: { ownerEmail: true, name: true },
    }),
    numerosMudos(clientId, visiveis),
    numerosComTokenQuebrado(clientId, visiveis),
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
  // ── Está melhorando ou piorando? ─────────────────────────────────────────
  // Sem comparação, todo número é um retrato: 16min é bom? Ruim? Ela não tinha
  // como saber se o trabalho do mês adiantou. O período anterior sai de graça —
  // as conversas já estão todas carregadas.
  const noAnterior = (d: Date | null) => !!d && d >= prevStart && d < prevEnd;
  const primeirasAntes: number[] = [];
  let leadsAntes = 0;
  for (const c of convs) {
    if (noAnterior(c.firstInboundAt)) leadsAntes++;
    if (c.firstResponseSec != null && noAnterior(c.firstResponseAt)) primeirasAntes.push(c.firstResponseSec);
  }
  const anterior = {
    leads: leadsAntes,
    primeiraRespostaSec: mediana(primeirasAntes),
  };

  // ── A que horas chegam, e a que horas são atendidos ──────────────────────
  // Decisão de escala, não de cobrança: se metade dos leads cai às 19h e a
  // primeira resposta nesse horário leva horas, o problema é o turno, não a
  // pessoa. O dado sempre existiu, diluído dentro da média do dia.
  const horaLocal = criarHoraLocal("America/Sao_Paulo");
  const porHora = Array.from({ length: 24 }, () => ({ leads: 0, primeiras: [] as number[] }));
  for (const c of convs) {
    if (!noPeriodo(c.firstInboundAt)) continue;
    const h = horaLocal(c.firstInboundAt!);
    porHora[h]!.leads++;
    if (c.firstResponseSec != null) porHora[h]!.primeiras.push(c.firstResponseSec);
  }
  const horas = porHora.map((x, h) => ({ hora: h, leads: x.leads, primeiraRespostaSec: mediana(x.primeiras) }));

  const nomeDe = (email: string) =>
    atendentes.find((a) => a.email === email)?.name
    || nomesDeQuemAtende.find((c) => c.ownerEmail === email)?.name
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

  // ── A faixa do dia que está descoberta ───────────────────────────────────
  // Um gráfico de 24 barras não é uma decisão. A decisão é "vale cobrir outro
  // turno?", e para isso o que importa é: existe um pedaço do dia onde chega
  // lead de verdade E a resposta demora muito mais que no resto?
  //
  // Três condições, e a mais importante é o PISO ABSOLUTO: ninguém muda a escala
  // da equipe por dois leads. Antes de proporção, tem que haver gente suficiente
  // naquela faixa para justificar cobrir um turno.
  //
  //   • pelo menos 5 leads na faixa lenta (senão é anedota, não padrão);
  //   • pelo menos 12% do total (senão é uma ponta irrelevante do dia);
  //   • pelo menos o dobro da mediana E 15 minutos a mais (lentidão de verdade).
  const MIN_LEADS_FAIXA = 5;
  const totalLeadsHora = horas.reduce((n, h) => n + h.leads, 0);
  let horarioFraco: { deHora: number; ateHora: number; leads: number; fatia: number; primeiraRespostaSec: number } | null = null;
  if (totalLeadsHora >= 10 && geral.primeiraRespostaSec != null) {
    const lentas = horas.filter((h) =>
      h.primeiraRespostaSec != null
      && h.primeiraRespostaSec >= geral.primeiraRespostaSec! * 2
      && h.primeiraRespostaSec - geral.primeiraRespostaSec! >= 900);
    if (lentas.length) {
      const leadsLentos = lentas.reduce((n, h) => n + h.leads, 0);
      const fatia = leadsLentos / totalLeadsHora;
      if (leadsLentos >= MIN_LEADS_FAIXA && fatia >= 0.12) {
        const ordenadas = [...lentas].sort((a, b) => a.hora - b.hora);
        horarioFraco = {
          deHora: ordenadas[0]!.hora,
          ateHora: ordenadas[ordenadas.length - 1]!.hora,
          leads: leadsLentos,
          fatia: Math.round(fatia * 100),
          primeiraRespostaSec: mediana(lentas.map((h) => h.primeiraRespostaSec!))!,
        };
      }
    }
  }

  // ── Gargalos ───────────────────────────────────────────────────────────────
  // Regras explícitas, não "a IA achou". Cada uma diz o que está acontecendo e
  // o que fazer — e nenhuma aparece quando não há o que apontar.
  const gargalos: Gargalo[] = [];

  // TOKEN RECUSADO vem antes de tudo, e é mais traiçoeiro que o número mudo:
  // aqui as mensagens CONTINUAM chegando, então nem o alerta de número mudo
  // pega. O que quebra é o resto — a foto que o lead mandou não abre e a IA
  // para de responder. O número parece perfeitamente vivo.
  for (const t of semToken) {
    const quanto = t.horas >= 48 ? `${Math.floor(t.horas / 24)} dias` : `${t.horas}h`;
    gargalos.push({
      tipo: "token_quebrado", gravidade: "alta",
      titulo: `A conexão de ${t.nome} perdeu o acesso há ${quanto}`,
      detalhe: `${t.erro}. As mensagens continuam chegando, então parece que está tudo bem — mas a foto que o lead manda não abre e a IA não responde. Precisa reconectar o número.`,
      pessoa: t.dono ?? undefined,
    });
  }

  // PRIMEIRO de todos, porque é o único que faz o resto da tela MENTIR: um
  // número fora do ar não recebe nada, então a pessoa dele aparece impecável —
  // fila zero, nada esperando. Sem este aviso, a gestora lê "está tranquilo".
  for (const m of mudos) {
    const dias = Math.floor(m.horasEmSilencio / 24);
    const quanto = dias >= 1 ? `${dias} ${dias === 1 ? "dia" : "dias"}` : `${m.horasEmSilencio}h`;
    gargalos.push({
      tipo: "numero_mudo", gravidade: "alta",
      titulo: `O WhatsApp de ${m.nome} não recebe nada há ${quanto}`,
      detalhe: "Provavelmente a conexão caiu. Enquanto isso os leads desse número não chegam — e, sem nada chegando, a pessoa aparece aqui como se estivesse em dia. Vale reconectar antes de cobrar atendimento.",
      pessoa: m.dono ?? undefined,
    });
  }

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

  return {
    periodLabel: label, period,
    geral, anterior, horas, horarioFraco, pessoas, equipes, gargalos,
    // Quem está mudo: a tela marca a linha da pessoa, senão ela continua
    // parecendo a melhor do time.
    mudos: mudos.map((m) => ({ nome: m.nome, dono: m.dono, horas: m.horasEmSilencio })),
    // Quem está sem credencial válida. A tela marca a linha da pessoa: sem isso
    // ela aparece normal, porque as mensagens continuam entrando.
    semToken: semToken.map((t) => ({ nome: t.nome, dono: t.dono, erro: t.erro, horas: t.horas })),
    numeros: conns.map((c) => ({ id: c.id, nome: nomeDoNumero.get(c.id)!, dono: c.ownerEmail })),
  };
}

export type InsightsEquipe = Awaited<ReturnType<typeof calcularInsightsEquipe>>;
export type PessoaEquipe = InsightsEquipe["pessoas"][number];
