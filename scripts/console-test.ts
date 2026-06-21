/**
 * Roda o motor REAL da IA em modo teste (igual ao Console) por uma conversa roteirizada.
 * Não envia WhatsApp, não grava nada. Uso:
 *   OPENAI_API_KEY=... DATABASE_URL=<public> npx tsx scripts/console-test.ts <clientId>
 */
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const clientId = process.argv[2] || "cmph8j12n002k3hql3pfc3j5b";
const turns = [
  "oi, vi o anuncio do taos",
  "quantos km tem?",
  "tem estepe?",
  "qual o ano da launching edition?",
  "tu acha bom pra viagem? rodo bastante",
  "tenho um virtus 2018 na troca, uns 50 mil km",
  "consigo financiar 100%?",
  "amanha posso ir ai ver?",
];

(async () => {
  const transcript: ChatMessage[] = [];
  for (const t of turns) {
    transcript.push({ role: "user", content: t });
    const out = await runAgent(
      { clientId, connectionId: "console", contact: { id: "console-test", name: "Teste", waId: "console" }, inboundText: t },
      { mode: "test", transcript },
    );
    console.log(`\n👤 LEAD: ${t}`);
    console.log(`🤖 BV: ${out.reply}`);
    const tools = (out.toolCalls ?? []).map((x) => x.name).join(", ");
    console.log(`   └ [decisão: ${out.decision}${tools ? ` · tools: ${tools}` : ""}]`);
    if (out.reply) transcript.push({ role: "assistant", content: out.reply });
  }
})().catch((e) => { console.error(e); process.exit(1); });
