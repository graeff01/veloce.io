/**
 * Acha as conversas em que a IA errou — para depois reproduzi-las contra o
 * motor atual e ver se as correções de hoje pegam.
 *
 * Quatro sinais, dos mais objetivos para os mais indiretos:
 *  A. a resposta seria BARRADA hoje (guarda de promessa de alterar cadastro)
 *  B. a resposta seria CORTADA hoje (roteador: pergunta que o cliente já respondeu)
 *  C. o turno terminou em abstenção/fallback/erro — ela não conseguiu responder
 *  D. um HUMANO respondeu logo depois dela, em menos de 2 min — o sinal mais
 *     honesto de todos: alguém precisou entrar para consertar
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { removerPromessaDeAlterar } from "@/lib/ai-agent/security/autoridade";
import { lerRegras, suprimir } from "@/lib/ai-agent/roteador";

const C = "cmrjao9n700dg5vudg1zlymk9";

type Achado = { contactId: string; quem: string; quando: string; sinal: string; trecho: string };

async function main() {
  const conns = (await db.waConnection.findMany({ where: { clientId: C }, select: { id: true } })).map((c) => c.id);
  const regras = lerRegras((await db.pricingConfig.findUnique({ where: { clientId: C }, select: { rules: true } }))?.rules);

  const msgs = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: conns } } },
    orderBy: { timestamp: "asc" },
    select: { id: true, contactId: true, direction: true, text: true, type: true, aiGenerated: true, timestamp: true,
              contact: { select: { displayName: true, name: true, waId: true } } },
  });

  const achados: Achado[] = [];
  const nome = (m: (typeof msgs)[number]) => m.contact.displayName ?? m.contact.name ?? m.contact.waId;

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.direction !== "out" || !m.aiGenerated || !m.text) continue;
    const base = { contactId: m.contactId, quem: nome(m), quando: m.timestamp.toISOString().slice(0, 16) };

    // A — promessa de alterar cadastro
    const pr = removerPromessaDeAlterar(m.text);
    if (pr.removidas.length) achados.push({ ...base, sinal: "A·promessa", trecho: pr.removidas[0] });

    // B — pergunta que o cliente já tinha respondido
    const anterior = [...msgs.slice(Math.max(0, i - 6), i)].reverse().find((x) => x.direction === "in" && x.text);
    if (anterior?.text && regras.length) {
      const sup = suprimir(regras, anterior.text, m.text);
      if (sup) achados.push({ ...base, sinal: "B·pergunta redundante", trecho: sup.removidas[0] });
    }

    // D — o LEAD reclamou logo depois. O sinal mais honesto: quem diz que a
    // resposta está errada é quem recebeu. (A versão anterior olhava "humano
    // respondeu depois" e era ruído: na coexistência a vendedora só ASSUME a
    // conversa — "Bom dia, sou a Kétlyn" — e isso não é correção.)
    const resp = msgs[i + 1];
    if (resp && resp.contactId === m.contactId && resp.direction === "in" && resp.text) {
      const t = resp.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (/\b(nao e (isso|bem)|voce errou|ta errado|esta errado|errada|nao entendi|nao foi isso|nao pedi|corrige|arruma|confus|nada a ver|pelo amor|de novo nao|ja falei|ja disse)\b/.test(t)) {
        achados.push({ ...base, sinal: "D·lead reclamou", trecho: `→ "${resp.text.slice(0, 80)}"` });
      }
    }

    // E — primeiro contato SEM vídeo: o caso do Lucas. A falha é uma AUSÊNCIA,
    // então nenhuma varredura de texto a encontraria.
    if (/primeiro contato/i.test(m.text)) {
      const depois = msgs.slice(i + 1).filter((x) => x.contactId === m.contactId);
      const confirmou = depois.find((x) => x.direction === "in" && /\b(sim|primeiro|primeira vez|nunca|isso)\b/i.test(x.text ?? ""));
      if (confirmou && !depois.some((x) => x.type === "video")) {
        achados.push({ ...base, sinal: "E·1º contato sem vídeo", trecho: `confirmou "${String(confirmou.text).slice(0, 50)}" e o vídeo não saiu` });
      }
    }
  }

  // C — turnos que terminaram sem resposta boa
  const ruins = await db.aiInteraction.findMany({
    where: { clientId: C, OR: [{ decision: { in: ["abster", "bloqueado", "erro"] } }, { status: { in: ["error", "blocked"] } }] },
    select: { contactId: true, decision: true, status: true, createdAt: true, outbound: true },
  });

  console.log("═══ CONVERSAS COM FALHA DA IA ═══\n");
  const porSinal = new Map<string, number>();
  for (const a of achados) porSinal.set(a.sinal, (porSinal.get(a.sinal) ?? 0) + 1);
  for (const [s, n] of [...porSinal].sort((a, b) => b[1] - a[1])) console.log(`  ${s.padEnd(24)} ${n}`);
  console.log(`  ${"C·abstenção/erro".padEnd(24)} ${ruins.length}`);

  const contatos = new Map<string, Achado[]>();
  for (const a of achados) { const l = contatos.get(a.contactId) ?? []; l.push(a); contatos.set(a.contactId, l); }
  console.log(`\ncontatos distintos com alguma falha: ${contatos.size}\n`);

  const ranking = [...contatos.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15);
  for (const [id, lista] of ranking) {
    console.log(`▸ ${lista[0].quem.padEnd(26)} ${String(lista.length).padStart(2)} sinal(is) · ${id}`);
    for (const a of lista.slice(0, 3)) console.log(`     ${a.quando} [${a.sinal}] ${a.trecho.replace(/\n/g, " ").slice(0, 88)}`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
