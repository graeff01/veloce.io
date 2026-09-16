/**
 * Teste da LEITURA DE IMAGEM contra fotos REAIS que leads mandaram.
 *
 * O replay normal (jr-simulation.ts) só reproduz texto — uma foto vira o
 * marcador "[O lead enviou uma imagem]" e a vision nunca é exercitada. Aqui a
 * foto é carregada do nosso próprio banco (WaMedia) e entregue ao agente como
 * data URI, igual ao que produção faz.
 *
 * Nada é enviado a ninguém (mode:"test") e nada é gravado.
 *
 * Uso:
 *   DATABASE_URL=<público> OPENAI_API_KEY=<...> AI_CHAT_TEMPERATURE=0 \
 *     npx tsx scripts/jr-vision-test.ts [--limit 8]
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9"; // JR Churrasqueiras
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const limite = Number(arg("limit") ?? 8);
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }

  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({
    where: { clientId: CLIENTE }, select: { visionEnabled: true },
  });
  console.log(`leitura de imagem no cadastro: ${cfg?.visionEnabled ? "LIGADA" : "DESLIGADA"}\n`);

  const conns = (await prismaUnscoped.waConnection.findMany({ where: { clientId: CLIENTE }, select: { id: true } })).map((c) => c.id);

  // Fotos de lead que TÊM o arquivo guardado. Sem o arquivo não há o que ler.
  const fotos = await prismaUnscoped.waMessage.findMany({
    where: { connectionId: { in: conns }, direction: "in", type: "image", media: { isNot: null } },
    orderBy: { timestamp: "desc" },
    take: limite,
    select: {
      id: true, text: true, timestamp: true, contactId: true,
      media: { select: { mime: true, data: true } },
      contact: { select: { name: true } },
    },
  });
  console.log(`${fotos.length} fotos reais selecionadas.\n${"=".repeat(74)}`);

  for (const f of fotos) {
    if (!f.media) continue;

    // Contexto: as mensagens que vieram ANTES da foto, como em produção.
    // A janela precisa ser larga o suficiente para a conversa já ter "história" —
    // com transcript curto e ficha vazia, a REGRA Nº 0 da abertura domina e a IA
    // responde a saudação, sem nunca olhar a foto.
    const antes = await prismaUnscoped.waMessage.findMany({
      where: { contactId: f.contactId, timestamp: { lt: f.timestamp }, text: { not: null } },
      orderBy: { timestamp: "desc" }, take: 16,
      select: { direction: true, text: true },
    });
    const transcript: ChatMessage[] = [...antes].reverse()
      .map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.text! } as ChatMessage));

    const legenda = f.text && !f.text.startsWith("[") ? f.text : "(foto sem legenda)";
    const inbound = f.text ?? "[O lead enviou uma imagem]";

    const uri = `data:${f.media.mime};base64,${Buffer.from(f.media.data).toString("base64")}`;
    const kb = Math.round(f.media.data.length / 1024);

    // A ficha REAL do contato (nome, modelo, cidade já coletados). Sem ela a IA
    // acha que é primeiro contato e volta a cumprimentar.
    const perfil = await prismaUnscoped.leadProfile.findUnique({
      where: { contactId: f.contactId }, select: { data: true },
    });
    const ficha = (perfil?.data as Record<string, unknown>) ?? {};
    if (!ficha.nome && f.contact?.name) ficha.nome = f.contact.name;

    // AQUECIMENTO — necessário para o teste ser fiel.
    //
    // `isFirst` conta as mensagens DA IA no histórico. Como a plataforma nunca
    // capturou as respostas das vendedoras (a JR atende em coexistência, pelo
    // celular), o histórico real tem quase só mensagens do lead — e então TODA
    // conversa parece primeiro contato: a IA responde a saudação de abertura e
    // nunca chega a olhar a foto.
    //
    // Então rodamos os últimos turnos do lead pela PRÓPRIA IA, acumulando as
    // respostas dela, e só aí entregamos a foto. É o mesmo mecanismo do replay.
    const contexto: ChatMessage[] = [];
    const aquecer = transcript.filter((m) => m.role === "user").slice(-3);
    for (const t of aquecer) {
      contexto.push(t);
      try {
        const w = await runAgent(
          { clientId: CLIENTE, connectionId: "sim", contact: { id: `sim-${f.contactId}`, name: f.contact?.name ?? null, waId: "0000000000" },
            inboundText: String(t.content) },
          { mode: "test", transcript: contexto, testFicha: ficha, testMemory: "" },
        );
        contexto.push({ role: "assistant", content: w.reply ?? "" });
      } catch { contexto.push({ role: "assistant", content: "" }); }
    }
    contexto.push({ role: "user", content: inbound }); // a mensagem ATUAL, antes do runAgent

    let resposta = "", ferramentas: string[] = [];
    try {
      const out = await runAgent(
        { clientId: CLIENTE, connectionId: "sim", contact: { id: `sim-${f.contactId}`, name: f.contact?.name ?? null, waId: "0000000000" },
          inboundText: inbound, inboundImages: [uri] },
        { mode: "test", transcript: contexto, testFicha: ficha, testMemory: "" },
      );
      resposta = out.reply ?? "(sem resposta)";
      ferramentas = (out.toolCalls ?? []).map((t) => t.name);
    } catch (e) { resposta = `[ERRO: ${String((e as Error)?.message ?? e).slice(0, 140)}]`; }

    console.log(`\n── ${f.contact?.name ?? "lead"} · ${kb} KB · ${f.timestamp.toISOString().slice(0, 10)}`);
    const ctx = contexto.slice(-3, -1).map((m) => `${m.role === "user" ? "lead" : "IA"}: ${String(m.content).slice(0, 70)}`);
    if (ctx.length) console.log(`   antes: ${ctx.join(" | ")}`);
    console.log(`   ficha: ${Object.keys(ficha).length ? JSON.stringify(ficha).slice(0, 90) : "(vazia)"}`);
    console.log(`   legenda: ${legenda}`);
    console.log(`   IA: ${resposta.replace(/\n/g, " ").slice(0, 400)}`);
    if (ferramentas.length) console.log(`   ferramentas: ${ferramentas.join(", ")}`);
  }
  console.log(`\n${"=".repeat(74)}\nNada foi enviado nem gravado.`);
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
