// ── Respostas rápidas e rascunhos ─────────────────────────────────────────────
// Três vendedoras respondendo 1.271 leads digitam as mesmas frases o dia
// inteiro. Um toque em vez de trinta segundos de digitação, várias vezes por
// hora, é o maior ganho de tempo que este app pode dar hoje.
//
// Por ora vivem NO APARELHO. Compartilhar entre a equipe exigiria backend, e
// preferi entregar o ganho agora a esperar a decisão de produto — a estrutura
// já está pronta para promover depois.
//
// Rascunho mora aqui pelo mesmo motivo: sair da conversa não pode apagar o que
// a pessoa escreveu.

import { Directory, File, Paths } from "expo-file-system";

const ARQ_RESPOSTAS = "respostas-rapidas.json";
const ARQ_RASCUNHOS = "rascunhos.json";

/** Ponto de partida — a pessoa edita, apaga e cria as suas. */
export const RESPOSTAS_INICIAIS = [
  "Oi! Tudo bem? Sou da equipe e vou te ajudar por aqui.",
  "Consigo sim! Me manda seu CEP que eu calculo o frete.",
  "O prazo de entrega é de até 15 dias úteis após a confirmação.",
  "Trabalhamos com cartão em até 12x, Pix e boleto.",
  "Posso te mandar o orçamento fechado agora?",
  "Vou verificar e já te retorno, tudo bem?",
];

function arquivo(nome: string): File {
  const pasta = new Directory(Paths.cache, "veloce");
  if (!pasta.exists) pasta.create({ intermediates: true });
  return new File(pasta, nome);
}

function lerJson<T>(nome: string, padrao: T): T {
  try {
    const f = arquivo(nome);
    if (!f.exists) return padrao;
    return JSON.parse(f.textSync()) as T;
  } catch { return padrao; }
}

function gravarJson(nome: string, v: unknown): void {
  try { arquivo(nome).write(JSON.stringify(v)); } catch { /* disco cheio: segue em memória */ }
}

// ── Respostas rápidas ───────────────────────────────────────────────────────

export function lerRespostas(): string[] {
  const v = lerJson<string[] | null>(ARQ_RESPOSTAS, null);
  return Array.isArray(v) ? v : RESPOSTAS_INICIAIS;
}

export function gravarRespostas(lista: string[]): void {
  gravarJson(ARQ_RESPOSTAS, lista.map((t) => t.trim()).filter(Boolean));
}

// ── Rascunhos, por conversa ─────────────────────────────────────────────────

type Rascunhos = Record<string, string>;

export function lerRascunho(contactId: string): string {
  return lerJson<Rascunhos>(ARQ_RASCUNHOS, {})[contactId] ?? "";
}

export function gravarRascunho(contactId: string, texto: string): void {
  const todos = lerJson<Rascunhos>(ARQ_RASCUNHOS, {});
  const limpo = texto.trim();
  if (limpo) todos[contactId] = texto;
  else delete todos[contactId]; // enviado ou apagado: não deixa lixo
  gravarJson(ARQ_RASCUNHOS, todos);
}

/** Logout leva respostas e rascunhos junto — são de outra conta. */
export function limparRespostasERascunhos(): void {
  for (const nome of [ARQ_RESPOSTAS, ARQ_RASCUNHOS]) {
    try { const f = arquivo(nome); if (f.exists) f.delete(); } catch { /* nada a fazer */ }
  }
}
