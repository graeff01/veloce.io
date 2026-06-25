// Mapeia o que os leads REALMENTE falam no WhatsApp para os mesmos ângulos do
// swipe de vencedores — rule-based, sem IA. É a base da "ponte": o que os leads
// puxam × o que vence no nicho.

const ANGLE_PATTERNS: { angle: string; re: RegExp }[] = [
  { angle: "entrada", re: /\b(entrada|financ|parcel|presta[çc]|consórcio|consorcio|cr[ée]dito|cdc|score|nome\s+(limpo|sujo|restri)|aprova|simula|quantas\s+vezes|carn[êe]|sem\s+entrada)\b/i },
  { angle: "preco", re: /\b(pre[çc]o|valor|quanto\s+(custa|fica|sai|é|e)|tabela|desconto|abaix|mais\s+barato|melhor\s+pre[çc]o|à\s+vista|a\s+vista|[úu]ltimo\s+pre[çc]o)\b/i },
  { angle: "comparacao", re: /\b(troca|na\s+troca|aceita\s+(meu|carro|moto|usado)|meu\s+(carro|usado)|avalia[rç])\b/i },
  { angle: "garantia", re: /\b(garantia|proced[êe]ncia|laudo|revisad|[úu]nico\s+dono|km|quilometr|batid|sinistr|leil[ãa]o|[íi]ntegro|hist[óo]rico)\b/i },
  { angle: "autoridade", re: /\b(onde\s+fica|endere[çc]o|loja\s*f[íi]sica|visitar|conhecer|ver\s+pessoalmente|test[\s-]?drive|hor[áa]rio)\b/i },
  { angle: "prova_social", re: /\b(confi[áa]vel|golpe|reclam|reputa|seguro\s+comprar|refer[êe]ncia|s[ãa]o\s+s[ée]rios)\b/i },
  { angle: "novidade", re: /\b(chegou|novo|nova|lan[çc]amento|0\s?km|zero\s?km|seminovo|semi-novo)\b/i },
  { angle: "urgencia", re: /\b(ainda\s+(tem|est[áa]|dispon[íi]vel)|dispon[íi]vel|reserv|[úu]ltima?\s+unidade|acab(ou|ando))\b/i },
];

// Conta menções por ângulo no conjunto de textos (uma mensagem pode tocar vários).
export function countLeadThemes(texts: (string | null)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of texts) {
    if (!t) continue;
    for (const { angle, re } of ANGLE_PATTERNS) {
      if (re.test(t)) counts[angle] = (counts[angle] ?? 0) + 1;
    }
  }
  return counts;
}
