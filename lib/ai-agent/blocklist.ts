// Lista GLOBAL de números que a IA NUNCA responde — em NENHUM cliente (donos,
// colaboradores, contadores, fornecedores...). É uma trava determinística, anterior
// ao LLM: se o número que mandou a mensagem casa com a lista, o agente NÃO atua.
//
// O casamento tolera o 9º dígito e o código de país do BR (sameBrazilNumber), igual
// ao canário (testNumbers) e aos operadores. A lista é pequena (dezenas), então
// mantemos um cache em processo com TTL curto para não bater no banco a cada mensagem —
// uma edição leva no máximo TTL_MS para valer em cada instância.
import { prisma } from "@/lib/prisma";
import { sameBrazilNumber } from "@/lib/phone-br";

const TTL_MS = 30_000;
let cache: { phones: string[]; at: number } | null = null;

async function loadPhones(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.phones;
  const rows = await prisma.aiBlockedNumber.findMany({ select: { phone: true } });
  const phones = rows.map((r) => r.phone);
  cache = { phones, at: Date.now() };
  return phones;
}

// Invalida o cache em processo (chamar após cadastrar/remover um número).
export function invalidateBlocklistCache() {
  cache = null;
}

// Casa um número (waId da mensagem) contra a lista de bloqueados, tolerando o 9º
// dígito/código de país do BR. Pura (testável sem banco).
export function matchesBlockedPhone(blocked: string[], waId: string): boolean {
  return blocked.some((p) => sameBrazilNumber(p, waId));
}

// true se o número está na lista global de bloqueio (a IA não deve responder).
// Fail-open: se a consulta falhar, NÃO bloqueia (não deixa a lista derrubar o atendimento).
export async function isGloballyBlocked(waId: string): Promise<boolean> {
  try {
    return matchesBlockedPhone(await loadPhones(), waId);
  } catch {
    return false;
  }
}
