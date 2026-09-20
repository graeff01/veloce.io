/**
 * Bateria: o cliente pede coisas específicas — a IA manda o catálogo CERTO?
 *
 * Hoje há seis opções (completo, conjuntos, churrasqueiras avulsas, fogões,
 * complementos, lareiras). Errar aqui é mandar 43 páginas para quem queria 4,
 * ou o recorte errado para quem queria tudo.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const C = "cmrjao9n700dg5vudg1zlymk9";
const PAUSA = Number(process.env.PAUSA_MS ?? 2500);

type Caso = {
  nome: string;
  turnos: string[];
  espera?: string;      // categoria que DEVE sair
  proibe?: string[];    // categorias que NÃO podem sair
  nenhum?: boolean;     // não pode mandar catálogo nenhum
};

const CASOS: Caso[] = [
  { nome: "catálogo completo, pedido explícito", turnos: ["oi", "Ana", "me manda o catálogo completo", "primeiro contato", "pode mandar"], espera: "churrasqueira" },
  { nome: "'manda o catálogo' genérico → o completo", turnos: ["oi", "Bruno", "manda o catálogo pra mim", "primeiro contato", "pode mandar"], espera: "churrasqueira" },
  { nome: "conjunto churrasqueira+fogão separado", turnos: ["oi", "Carla", "quero churrasqueira com fogão", "primeiro contato", "quero o fogão campeiro separado, do lado"], espera: "conjunto_fogao" },
  { nome: "só os fogões campeiros", turnos: ["oi", "Diego", "quero ver só os fogões campeiros que vocês têm", "pode mandar"], proibe: ["churrasqueira"] },
  { nome: "só os fornos", turnos: ["oi", "Elza", "vocês têm forno? queria ver os fornos"], proibe: ["churrasqueira"] },
  { nome: "pias e bancada", turnos: ["oi", "Fabio", "vocês têm pia e bancada pra área gourmet? manda o que tem"], proibe: ["churrasqueira"] },
  { nome: "lareiras", turnos: ["oi", "Gina", "tem lareira? manda o catálogo"], espera: "lareira" },
  { nome: "só churrasqueiras, sem conjunto", turnos: ["oi", "Hugo", "quero ver só as churrasqueiras sozinhas, sem fogão junto", "primeiro contato", "pode mandar"], proibe: ["conjunto_fogao"] },
  { nome: "modelo nomeado → foto, NÃO catálogo", turnos: ["oi", "Iris", "quero ver a churrasqueira gourmet"], nenhum: true },
  { nome: "pergunta de preço → não é pedido de catálogo", turnos: ["oi", "João", "quanto custa a prime 9?"], nenhum: true },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  let falhas = 0;
  for (const c of CASOS) {
    const transcript: ChatMessage[] = [];
    const ficha: Record<string, unknown> = {};
    const cats: string[] = [];
    const pdfs: string[] = [];
    for (const t of c.turnos) {
      await new Promise((r) => setTimeout(r, PAUSA));
      transcript.push({ role: "user", content: t });
      let reply = "";
      try {
        const out = await runAgent(
          { clientId: C, connectionId: "sim", contact: { id: `cat-${c.nome.slice(0, 8)}`, name: null, waId: "0" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? "";
        for (const tc of out.toolCalls ?? []) {
          const x = tc as { name?: string; args?: Record<string, unknown> };
          if (x?.name === "enviar_catalogo") cats.push(String(x.args?.categoria ?? "(padrão)"));
        }
        for (const a of out.artifacts ?? []) if ((a as { kind?: string }).kind === "pdf") pdfs.push(String((a as { url?: string }).url ?? "").split("/").pop() ?? "");
      } catch (e) { reply = `[ERRO ${String((e as Error).message).slice(0, 60)}]`; }
      transcript.push({ role: "assistant", content: reply });
    }
    const unicos = [...new Set(cats)];
    const pdfU = [...new Set(pdfs)];
    let ok = true; const notas: string[] = [];
    if (c.espera) { const t = unicos.includes(c.espera); if (!t) ok = false; notas.push(`${t ? "✓" : "✗"} esperava '${c.espera}'`); }
    for (const p of c.proibe ?? []) { const t = !unicos.includes(p); if (!t) ok = false; notas.push(`${t ? "✓" : "✗"} não podia '${p}'`); }
    if (c.nenhum) { const t = unicos.length === 0; if (!t) ok = false; notas.push(`${t ? "✓" : "✗"} não podia mandar catálogo`); }
    if (!ok) falhas++;
    console.log(`${ok ? "✓" : "✗"} ${c.nome.padEnd(42)} → ${unicos.join(",") || "nenhum"}${pdfU.length ? "  [" + pdfU.join(",") + "]" : ""}`);
    for (const n of notas.filter((x) => x.startsWith("✗"))) console.log(`      ${n}`);
  }
  console.log(`\n${falhas === 0 ? "todos os casos passaram" : `${falhas} de ${CASOS.length} erraram`}`);
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
