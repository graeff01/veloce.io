/**
 * Sonda da SÍNTESE de handoff (ficha.ts → synthesizeNarrative), sobre dados SINTÉTICOS
 * (sem PII de cliente real). Valida a qualidade do parágrafo "🧭 Contexto pro vendedor".
 * Uso: OPENAI_API_KEY=... npx tsx scripts/ficha-probe.ts
 */
import { synthesizeNarrative } from "@/lib/ai-agent/ficha";

const CASES: { nome: string; facts: string; memory: string; history: string }[] = [
  {
    nome: "Troca + financiamento + urgência",
    facts: [
      "• Interesse: VW Taos Highline 2022",
      "• Troca: Onix 2019, ~60 mil km, conservado",
      "• Financiamento: quer financiar o restante, ~3 anos",
      "• Urgência: essa semana (carro atual dando problema)",
      "• Uso/motivação: família",
    ].join("\n"),
    memory: "Lead interessado no Taos. Tem Onix 2019 na troca. Quer financiar parte em 3 anos. Pressa: carro atual com defeito.",
    history: "Lead: tenho interesse no Taos, preciso trocar meu carro\nLoja: legal! qual o seu atual?\nLead: Onix 2019, 60 mil km\nLoja: e pensa em financiar o restante?\nLead: sim, uns 3 anos. preciso resolver essa semana",
  },
  {
    nome: "Pouca info (deve ser breve)",
    facts: "• Interesse: SUV pra família",
    memory: "",
    history: "Lead: tô começando a pesquisar um SUV pra família",
  },
  {
    nome: "Objeção de preço + concorrente",
    facts: [
      "• Interesse: VW Taos Highline 2022 (R$ 136.900)",
      "• O que mais pesa: preço",
      "• Estágio: comparando modelos",
    ].join("\n"),
    memory: "Achou o Taos caro, viu parecido mais barato em outra loja. Comparando.",
    history: "Lead: esse Taos tá 137? achei caro, vi mais barato em outra loja\nLoja: entendo! aqui todos são revisados e com garantia de 2 anos\nLead: e por que eu compraria com vocês?",
  },
];

(async () => {
  for (const c of CASES) {
    console.log(`\n━━━ ${c.nome} ━━━`);
    const narrative = await synthesizeNarrative(c.facts, c.memory, c.history);
    console.log(`🧭 ${narrative || "(vazio — sem chave ou dados de menos)"}`);
  }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
