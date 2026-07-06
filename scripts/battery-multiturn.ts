/**
 * Bateria MULTI-TURNO (modo teste, não envia nada). Cada cenário é uma conversa
 * inteira com o MESMO contato, pra exercitar o que o single-turn não pega:
 * qualificação que raciocina sobre o histórico, saber QUANDO parar de perguntar,
 * não re-perguntar o já respondido, e avançar quando o lead já decidiu.
 * Uso: OPENAI_API_KEY=... DATABASE_URL=<public> npx tsx scripts/battery-multiturn.ts <clientId>
 */
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const id = process.argv[2] || "cmph8j12n002k3hql3pfc3j5b";

const SCENARIOS: { nome: string; foco: string; turns: string[] }[] = [
  {
    nome: "A. Pesquisando → orçamento → some → volta",
    foco: "não re-perguntar família/orçamento; reconhecer o retorno; ler estágio 'pesquisando' e não empurrar",
    turns: [
      "oi, vi um SUV de vocês, tô começando a pesquisar",
      "é pra família, tenho dois filhos pequenos",
      "meu teto é uns 140 mil",
      "vou pensar com calma e depois te falo",
      "oi, voltei... aquele SUV ainda tá disponível?",
    ],
  },
  {
    nome: "B. Impaciente, só quer preço",
    foco: "entregar o preço e PARAR de qualificar; nada de interrogatório; porta aberta sem cobrar",
    turns: [
      "quanto tá o Taos?",
      "só quero saber o preço, sem enrolação",
      "aham",
    ],
  },
  {
    nome: "C. Decidido, quer fechar",
    foco: "NÃO enfiar mais pergunta de qualificação; avançar pro próximo passo (handoff)",
    turns: [
      "quero o Corolla que vocês tem",
      "pode ser esse mesmo, quero fechar. como faço?",
    ],
  },
  {
    nome: "D. Troca + financiamento + urgência (alimenta a ficha)",
    foco: "captar troca, financiamento e urgência sem interrogar; 1 por vez; handoff rico no fim",
    turns: [
      "tenho interesse no Taos, mas preciso trocar meu carro atual",
      "é um Onix 2019, uns 60 mil km, bem conservado",
      "e o restante dá pra financiar? uns 3 anos",
      "preciso resolver essa semana, meu carro tá dando problema",
    ],
  },
  {
    nome: "E. Lead de longe / distância",
    foco: "empatia + não empurrar visita; mencionar entrega; deixar pro vendedor combinar",
    turns: [
      "vi o Taos de vocês, mas moro em Caxias, é meio longe aí",
      "e como funciona pra quem é de fora?",
    ],
  },
  {
    nome: "F. Objeção elaborada (caro + concorrente)",
    foco: "reagir como gente + argumento de valor (procedência/revisão/garantia); NÃO negociar preço",
    turns: [
      "esse Taos tá 137? achei caro, vi um parecido mais barato em outra loja",
      "e por que eu compraria com vocês então?",
    ],
  },
];

(async () => {
  for (const s of SCENARIOS) {
    console.log(`\n━━━ ${s.nome} ━━━`);
    console.log(`   (foco: ${s.foco})`);
    const transcript: ChatMessage[] = [];
    for (const t of s.turns) {
      transcript.push({ role: "user", content: t });
      const o = await runAgent(
        { clientId: id, connectionId: "console", contact: { id: `mt-${s.nome}`, name: "Teste", waId: "console" }, inboundText: t },
        { mode: "test", transcript },
      );
      const tools = (o.toolCalls ?? []).map((x) => x.name).join(",");
      console.log(`\n👤 ${t}`);
      console.log(`🤖 ${(o.reply ?? "").replace(/\n+/g, " ⏎ ")}`);
      console.log(`   └ ${o.decision}${tools ? ` · ${tools}` : ""}`);
      if (o.reply) transcript.push({ role: "assistant", content: o.reply });
    }
  }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
