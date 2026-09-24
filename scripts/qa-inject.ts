/**
 * QA ponta a ponta: injeta mensagens ASSINADAS no webhook REAL e lê o que a IA
 * gerou de verdade.
 *
 * POR QUE ISTO EXISTE. A simulação por replay (jr-simulation.ts) roda o
 * orquestrador em `mode:"test"`, o que deixa três coisas FORA do teste — e são
 * justamente as que mais quebraram em produção:
 *
 *   · a FILA (debounce, coalescing, turno em voo). O replay alimenta um turno
 *     por vez, então nunca reproduz duas mensagens chegando juntas — que é o
 *     bug do turno duplicado e da mensagem engolida.
 *   · o PDF do orçamento. Em `mode:"test"` o gerar_orcamento curto-circuita e
 *     devolve "PDF enviado ao lead", então o caminho live nunca roda.
 *   · o envio de verdade (WhatsApp Graph), o takeover e o gatekeeper.
 *
 * Regra de honestidade que vem junto: só é "provado" o que passou por aqui.
 * Offline é hipótese.
 *
 * ESTE ARQUIVO JÁ EXISTIU E SE PERDEU. A primeira versão vivia no scratchpad de
 * uma sessão e nunca foi versionada; quando foi preciso de novo, não havia mais.
 * Por isso está no repo.
 *
 * SEGURANÇA DO MÉTODO
 *  · número FALSO (DDD 51, faixa 900xxxxxx não alocada): o envio falha no Graph
 *    e nenhuma pessoa real recebe nada;
 *  · lê `AiInteraction.outbound`, que o orquestrador grava INDEPENDENTE do envio
 *    ter dado certo — é o que a IA realmente gerou;
 *  · NÃO altera a config do cliente. O contato falso é criado com
 *    `aiEngaged=true`, que é o que faz a IA responder no modo manual;
 *  · limpa o contato falso ao fim de cada cenário.
 *
 * COMO RODAR (os segredos ficam no Railway; nada é materializado em disco):
 *   railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
 *     export DATABASE_URL=\"$DATABASE_PUBLIC_URL\"; npx tsx scripts/qa-inject.ts battery"'
 *
 *   scripts/qa-inject.ts smoke      → 1 cenário rápido
 *   scripts/qa-inject.ts battery    → a bateria toda
 *   scripts/qa-inject.ts fila       → só os cenários de fila (rajada)
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const URL_WEBHOOK = process.env.QA_WEBHOOK_URL || "https://veloceio-production.up.railway.app/api/whatsapp/webhook";
const PHONE_NUMBER_ID = process.env.QA_PHONE_NUMBER_ID || "385502153163016"; // JR
const SEGREDO = process.env.WHATSAPP_APP_SECRET;
const ESPERA_MS = Number(process.env.QA_WAIT_MS || 20_000); // debounce 8s + folga

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
if (!SEGREDO) { console.error("WHATSAPP_APP_SECRET ausente (rode via railway run --service veloce.io)"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Faixa não alocada: o Graph recusa o envio, ninguém real é tocado.
const numeroFalso = () => `5551900${String(Math.floor(Math.random() * 900000) + 100000)}`;

function corpo(waId: string, texto: string, wamid: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "qa",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "0", phone_number_id: PHONE_NUMBER_ID },
          contacts: [{ profile: { name: "QA Teste" }, wa_id: waId }],
          messages: [{ from: waId, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }],
        },
      }],
    }],
  };
}

async function injetar(waId: string, texto: string): Promise<number> {
  const wamid = `wamid.QA${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const raw = JSON.stringify(corpo(waId, texto, wamid));
  const assinatura = "sha256=" + crypto.createHmac("sha256", SEGREDO!).update(raw, "utf8").digest("hex");
  const r = await fetch(URL_WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": assinatura },
    body: raw,
  });
  return r.status;
}

/**
 * Contato falso pronto para conversar.
 *
 * `semeado` evita o furo de método da primeira bateria: contato novo cai no
 * PRIMEIRO turno, que por regra do cliente é só a saudação — e a saudação
 * mascara o conteúdo que se quer testar. Semear histórico faz a IA tratar a
 * mensagem como meio de conversa.
 */
async function criarContato(clientId: string, connectionId: string, semeado: boolean) {
  const waId = numeroFalso();
  const contato = await prisma.waContact.create({
    data: { connectionId, waId, name: "QA Teste", aiEngaged: true },
  });
  if (semeado) {
    await prisma.waMessage.createMany({
      data: [
        { connectionId, contactId: contato.id, waMessageId: `qa-seed-in-${Date.now()}`, direction: "in", type: "text", text: "Oi, boa tarde", timestamp: new Date(Date.now() - 300_000) },
        { connectionId, contactId: contato.id, waMessageId: `qa-seed-out-${Date.now()}`, direction: "out", type: "text", text: "Olá! Sou o Juninho, assistente virtual da JR Churrasqueiras. Qual seu nome?", aiGenerated: true, timestamp: new Date(Date.now() - 290_000) },
        { connectionId, contactId: contato.id, waMessageId: `qa-seed-in2-${Date.now()}`, direction: "in", type: "text", text: "Sou o Carlos", timestamp: new Date(Date.now() - 280_000) },
      ],
    });
    await prisma.aiInteraction.create({
      data: { clientId, contactId: contato.id, inbound: "Sou o Carlos", outbound: "Prazer, Carlos!", decision: "respondeu_duvida", status: "ok" },
    });
    await prisma.leadProfile.upsert({
      where: { contactId: contato.id },
      create: { connectionId, contactId: contato.id, data: { nome: "Carlos" } as object },
      update: { data: { nome: "Carlos" } as object },
    });
  }
  return contato;
}

async function limpar(contactId: string, waId: string) {
  await prisma.aiInteraction.deleteMany({ where: { contactId } }).catch(() => {});
  await prisma.waMessage.deleteMany({ where: { contactId } }).catch(() => {});
  await prisma.leadProfile.deleteMany({ where: { contactId } }).catch(() => {});
  await prisma.aiJob.deleteMany({ where: { contactId } }).catch(() => {});
  await prisma.quote.deleteMany({ where: { contactId } }).catch(() => {});
  // WaEvent referencia o contato por `refId`, não por contactId.
  await prisma.waEvent.deleteMany({ where: { refId: contactId } }).catch(() => {});
  await prisma.waConversation.deleteMany({ where: { contactId } }).catch(() => {});
  // A escalação cria TASK de verdade na operação (createEscalationTask). Sem
  // apagar, o teste deixa lixo na fila de trabalho da equipe. A descrição da
  // task carrega o waId, que é como se acha a do contato falso.
  await prisma.task.deleteMany({ where: { description: { contains: waId } } }).catch(() => {});
  await prisma.waContact.delete({ where: { id: contactId } }).catch(() => {});
}

interface Cenario {
  id: string;
  /**
   * Aciona handoff ou orçamento — ou seja, NOTIFICA gente de verdade.
   *
   * A escalação cria Task e avisa os operadores; o orçamento entra na fila de
   * revisão do portal (pushPortalReview). A limpeza apaga o registro, mas a
   * NOTIFICAÇÃO já saiu e não dá para desfazer. Por isso estes ficam fora do
   * modo `battery` e só rodam em `full`, deliberadamente.
   */
  tocaOperacao?: boolean;
  /** mensagens do lead; mais de uma = RAJADA (o intervalo é `gapMs`) */
  mensagens: string[];
  gapMs?: number;
  semeado?: boolean;
  /** o que precisa ser verdade no que a IA gerou */
  espera: (r: { respostas: string[]; turnos: number; tools: string[] }) => string | null;
}

const CENARIOS: Cenario[] = [
  // ── FILA — o que o replay NÃO alcança ──────────────────────────────────────
  {
    id: "FILA1 · rajada de duas mensagens",
    // O bug do Willian (21/09): "Fogão campeiro" e, 6s depois, "Queria saber os
    // valores?". O bloco de 3 mensagens saiu DUAS VEZES e a segunda pergunta
    // nunca virou turno.
    mensagens: ["Quero um fogão campeiro", "Queria saber os valores?"],
    gapMs: 6_000,
    semeado: true,
    espera: (r) => {
      // Duplicação é o MESMO TEXTO saindo duas vezes — que foi o que aconteceu com
      // o Willian (3 blocos idênticos, intercalados). Contar TURNOS não serve: duas
      // mensagens com 6s de intervalo podem legitimamente virar dois turnos, cada
      // um respondendo uma coisa diferente, e isso está certo.
      //
      // A primeira versão deste critério reprovou um comportamento CORRETO em
      // produção por contar turnos (e por contar a interação semeada junto).
      const vistos = new Set<string>();
      for (const t of r.respostas) {
        const k = t.trim().toLowerCase();
        if (vistos.has(k)) return `duplicou: a mesma resposta saiu 2x — ${JSON.stringify(t.slice(0, 60))}`;
        vistos.add(k);
      }
      if (r.turnos === 0) return "engoliu: nenhum turno gerado";
      return null;
    },
  },
  {
    id: "FILA2 · mensagem durante o turno em voo",
    // Aqui o intervalo é MAIOR que o debounce: a segunda mensagem chega com o
    // primeiro turno já rodando. Antes, o delete do fim do turno apagava o job
    // que a carregava e ela nunca era respondida.
    mensagens: ["Qual o valor da churrasqueira Tradição?", "E vocês entregam em Canoas?"],
    gapMs: 11_000,
    semeado: true,
    espera: (r) => {
      if (r.turnos < 2) return `a segunda mensagem foi engolida (${r.turnos} turno(s) para 2 mensagens separadas)`;
      return null;
    },
  },
  // ── Naturalidade (o que foi corrigido neste lote) ──────────────────────────
  {
    id: "NAT1 · não pede licença para enviar o catálogo",
    mensagens: ["Me manda o catálogo completo de churrasqueiras"],
    semeado: true,
    espera: (r) => {
      const t = r.respostas.join(" ").toLowerCase();
      if (/posso (te )?(enviar|mandar)|quer que eu (envie|mande)/.test(t)) return "pediu licença para enviar";
      return null;
    },
  },
  {
    id: "NAT2 · sem clichê de disponibilidade no fecho",
    mensagens: ["Obrigado, era só isso mesmo"],
    semeado: true,
    espera: (r) => {
      const t = r.respostas.join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      // O pronome oblíquo furava o critério: "é só ME chamar" passava por um
      // regex que só previa "é só chamar" — e deu FALSO VERDE numa rodada.
      if (/estou aqui para ajudar(?! voce)|estou por aqui|fico a disposicao|[eé] s[oó] (me |nos )?(chamar|cham[ae]|fal[ae]|avis[ae])|qualquer (duvida|coisa)[,.!]? *(me )?(cham|fal|avis)/.test(t)) return "clichê de disponibilidade no fecho";
      return null;
    },
  },
  {
    id: "NAT3 · saudação respondida não vira nome",
    mensagens: ["Dia"],
    semeado: false, // primeiro turno de propósito: é quando a IA pergunta o nome
    espera: () => null, // conferido no turno seguinte, manualmente
  },
  // ── Dado do produto ────────────────────────────────────────────────────────
  {
    id: "CAP1 · não adota o número de espetos do cliente",
    // Rosi (replay): a IA disse "a Popular comporta 4 espetos", o lead respondeu
    // "está bom com 7" e ela emendou "foto da Popular com 7 espetos".
    mensagens: ["Quero a churrasqueira Popular. Está bom com 7 espetos, né?"],
    semeado: true,
    espera: (r) => {
      const t = r.respostas.join(" ").toLowerCase();
      if (/popular[^.!?]{0,40}7\s*espetos|7\s*espetos[^.!?]{0,20}(da|do)?\s*popular/.test(t)) return "confirmou 7 espetos para a Popular (são 4)";
      return null;
    },
  },
  {
    id: "POP1 · avisa que a Popular não aceita lenha",
    // Depende da regra do roteador estar GRAVADA (jr-roteador-aplicar.ts).
    mensagens: ["Quero a churrasqueira Popular 65 lisa"],
    semeado: true,
    espera: (r) => {
      const t = r.respostas.join(" ").toLowerCase();
      if (!/lenha/.test(t)) return "não avisou sobre lenha (a regra do roteador está gravada?)";
      return null;
    },
  },
  // ── Orçamento: o caminho LIVE do PDF ───────────────────────────────────────
  {
    id: "ORC1 · orça e manda o PDF sem pedir licença",
    tocaOperacao: true,
    mensagens: ["Quero orçamento da churrasqueira Tradição, entrega em Canoas, local térreo"],
    semeado: true,
    espera: (r) => {
      const t = r.respostas.join(" ").toLowerCase();
      if (/posso (te )?(enviar|mandar) o (pdf|or[cç]amento)/.test(t)) return "pediu licença para mandar o PDF";
      if (r.tools.includes("gerar_orcamento") && !r.tools.includes("enviar_orcamento")) return "gerou o orçamento e não chamou enviar_orcamento";
      return null;
    },
  },
];

async function rodar(cenarios: Cenario[]) {
  const cliente = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!cliente) { console.error("cliente não encontrado"); process.exit(1); }
  const conn = await prisma.waConnection.findFirst({ where: { clientId: cliente.id }, select: { id: true, phoneNumberId: true } });
  if (!conn) { console.error("conexão não encontrada"); process.exit(1); }

  // O deploy chegou? Sem isto a bateria testa o código ANTIGO e o resultado mente.
  // Aconteceu três vezes seguidas: ❌ que era só deploy pendente.
  try {
    const h = await fetch(URL_WEBHOOK.replace("/api/whatsapp/webhook", "/api/health")).then((r) => r.json());
    const local = execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
    if (h?.version && h.version !== "desconhecida" && h.version !== local) {
      console.log(`\n⚠️  PRODUÇÃO está em ${h.version} e o local em ${local}.`);
      console.log(`   A bateria testa o que está NO AR — espere o deploy antes de acreditar num ❌.\n`);
    } else if (h?.version === local) {
      console.log(`\n✓ produção está no commit local (${local})`);
    }
  } catch { /* sem /health, segue */ }

  console.log(`\nQA E2E · ${cliente.name} · webhook ${URL_WEBHOOK}`);
  console.log(`${cenarios.length} cenário(s) · espera ${ESPERA_MS / 1000}s por cenário\n`);

  let falhas = 0;
  for (const c of cenarios) {
    const contato = await criarContato(cliente.id, conn.id, c.semeado ?? true);
    const inicio = new Date();
    try {
      for (let i = 0; i < c.mensagens.length; i++) {
        const st = await injetar(contato.waId, c.mensagens[i]);
        if (st !== 200) console.log(`    ⚠️ webhook devolveu ${st}`);
        if (i < c.mensagens.length - 1) await sleep(c.gapMs ?? 1_200);
      }
      await sleep(ESPERA_MS);

      // `gte: inicio` exclui a interação SEMEADA — ela é criada antes de injetar e
      // entrava na contagem, inflando o número de turnos do cenário.
      const inters = await prisma.aiInteraction.findMany({
        where: { contactId: contato.id, createdAt: { gte: inicio } },
        orderBy: { createdAt: "asc" },
        select: { outbound: true, toolCalls: true, decision: true, status: true },
      });
      const respostas = inters.map((i) => i.outbound ?? "").filter(Boolean);
      const tools = inters.flatMap((i) => ((i.toolCalls as { name: string }[] | null) ?? []).map((t) => t.name));
      const problema = c.espera({ respostas, turnos: inters.length, tools });

      console.log(`${problema ? "❌" : "✅"} ${c.id}`);
      if (problema) { falhas++; console.log(`    → ${problema}`); }
      for (const r of respostas) console.log(`    IA: ${r.replace(/\n/g, " ⏎ ").slice(0, 150)}`);
      if (tools.length) console.log(`    tools: ${tools.join(", ")}`);
    } finally {
      await limpar(contato.id, contato.waId);
    }
    console.log();
  }
  console.log(falhas ? `\n❌ ${falhas}/${cenarios.length} cenário(s) com problema\n` : `\n✅ ${cenarios.length}/${cenarios.length} cenários passaram\n`);
  process.exit(falhas ? 1 : 0);
}

const modo = process.argv[2] ?? "smoke";
// `battery` deixa de fora o que notifica gente de verdade — ver `tocaOperacao`.
// `full` roda tudo, e é escolha consciente de quem chama.
const alvo = modo === "battery" ? CENARIOS.filter((c) => !c.tocaOperacao)
  : modo === "full" ? CENARIOS
  : modo === "fila" ? CENARIOS.filter((c) => c.id.startsWith("FILA"))
  : CENARIOS.slice(0, 1);
if (modo === "battery" && CENARIOS.some((c) => c.tocaOperacao)) {
  console.log(`(${CENARIOS.filter((c) => c.tocaOperacao).length} cenário(s) fora: notificam a equipe. Use "full" para incluir.)`);
}
rodar(alvo).catch((e) => { console.error(e); process.exit(1); });
