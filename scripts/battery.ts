/**
 * Bateria de cenários reais (modo teste, não envia nada). Cada cenário = contato novo.
 * Ancorada no comportamento real dos leads da Boqueirão.
 * Uso: OPENAI_API_KEY=... DATABASE_URL=<public> npx tsx scripts/battery.ts <clientId>
 */
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const id = process.argv[2] || "cmph8j12n002k3hql3pfc3j5b";

const SCENARIOS: { nome: string; turns: string[] }[] = [
  { nome: "1. Abertura anúncio (mais comum)", turns: ["Olá, vim pelo anúncio do Taos Highline"] },
  { nome: "2. Preço (informal, real)", turns: ["e o valor que você está pedindo nela?"] },
  { nome: "3. Km + ano", turns: ["qual a km e o ano dela?"] },
  { nome: "4. Fotos -> interior (galeria)", turns: ["tem fotos dele por aqui", "e do interior?"] },
  { nome: "5. Horário HOJE (sábado)", turns: ["vcs ficam até que horas hoje?"] },
  { nome: "6. Amanhã (domingo, fechado)", turns: ["amanhã vocês abrem?"] },
  { nome: "7. Financiamento 100% (tem anúncio disso)", turns: ["consigo financiar 100%?"] },
  { nome: "8. Troca", turns: ["tenho um Onix 2019 na troca, uns 60 mil km"] },
  { nome: "9. Spec fora do catálogo (manual/estepe)", turns: ["tem no manual dele? e tem estepe?"] },
  { nome: "10. DESCONTO (trava)", turns: ["faz por 120 mil? me dá um desconto"] },
  { nome: "11. 'tá caro' (objeção)", turns: ["nossa, tá caro isso"] },
  { nome: "12. Disponível? / já vendeu", turns: ["ainda tem? ou já venderam?"] },
  { nome: "13. Opt-out", turns: ["cara, me esquece, não quero mais"] },
  { nome: "14. Fora do escopo", turns: ["qual a capital da França?"] },
  { nome: "15. Modelo/ano que não tem (oferecer similar)", turns: ["vocês tem Corolla 2024?"] },
];

(async () => {
  for (const s of SCENARIOS) {
    console.log(`\n━━━ ${s.nome} ━━━`);
    const transcript: ChatMessage[] = [];
    for (const t of s.turns) {
      transcript.push({ role: "user", content: t });
      const o = await runAgent({ clientId: id, connectionId: "console", contact: { id: `bat-${s.nome}`, name: "Teste", waId: "console" }, inboundText: t }, { mode: "test", transcript });
      const tools = (o.toolCalls ?? []).map((x) => x.name).join(",");
      console.log(`👤 ${t}`);
      console.log(`🤖 ${(o.reply ?? "").replace(/\n+/g, " ⏎ ")}`);
      console.log(`   └ ${o.decision}${tools ? ` · ${tools}` : ""}`);
      if (o.reply) transcript.push({ role: "assistant", content: o.reply });
    }
  }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
