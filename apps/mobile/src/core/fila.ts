// ── Fila de envio (lógica pura) ───────────────────────────────────────────────
// Separada da UI para ser testável sem aparelho. A parte que persiste e reenvia
// vive em `ui/fila-envio`.

/** O que a fila sabe enviar. Mídia guarda o arquivo, não os bytes. */
export type Especie = "texto" | "imagem" | "documento" | "audio";

export interface Pendente {
  /** Id local, também usado como chave de idempotência na bolha otimista. */
  id: string;
  contactId: string;
  especie: Especie;
  /** Texto da mensagem, ou a legenda quando é mídia. */
  texto: string;
  /**
   * Caminho local do arquivo, para mídia. Fica no cache e sobrevive a fechar o
   * app — por isso a fila guarda o CAMINHO e não os bytes: uma foto de 3 MB no
   * JSON da fila seria desperdício e risco de estourar o arquivo.
   */
  arquivo?: { uri: string; nome: string; tipo: string };
  criadoEm: number;
  /** Quantas vezes já tentamos. Alimenta o recuo entre tentativas. */
  tentativas: number;
}

/** Mídia demora mais e merece mais paciência que uma linha de texto. */
export const validadeDe = (p: Pendente): number =>
  p.especie === "texto" ? VALIDADE_MS : VALIDADE_MS * 3;

/** Recuo exponencial com teto: 2s, 4s, 8s, 16s, 30s, 30s… */
export function esperaMs(tentativas: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, tentativas - 1));
}

/** Está na hora de tentar de novo? */
export function podeTentar(p: Pendente, agora: number): boolean {
  if (p.tentativas === 0) return true;
  return agora - p.criadoEm >= esperaMs(p.tentativas);
}

/** Próximo da fila para um contato, respeitando a ordem de digitação. */
export function proximo(fila: Pendente[], agora: number): Pendente | null {
  const prontos = fila.filter((p) => podeTentar(p, agora));
  if (prontos.length === 0) return null;
  return prontos.reduce((a, b) => (a.criadoEm <= b.criadoEm ? a : b));
}

export const daConversa = (fila: Pendente[], contactId: string): Pendente[] =>
  fila.filter((p) => p.contactId === contactId).sort((a, b) => a.criadoEm - b.criadoEm);

export const semItem = (fila: Pendente[], id: string): Pendente[] => fila.filter((p) => p.id !== id);

export function comTentativa(fila: Pendente[], id: string, agora: number): Pendente[] {
  return fila.map((p) => (p.id === id ? { ...p, tentativas: p.tentativas + 1, criadoEm: agora } : p));
}

/**
 * Mensagem velha demais deixa de fazer sentido: responder um lead duas horas
 * depois do que a vendedora achou que tinha respondido é pior do que não
 * responder. Uma hora é o limite.
 */
export const VALIDADE_MS = 60 * 60 * 1000;

export const expiradas = (fila: Pendente[], agora: number): Pendente[] =>
  fila.filter((p) => agora - p.criadoEm > validadeDe(p));
