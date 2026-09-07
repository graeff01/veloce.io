// ── Há quanto tempo o lead espera ────────────────────────────────────────────
// Puro e testável. A regra é simples e a consequência não é: com 1.257 conversas
// aguardando, sem esta leitura a lista é uma parede indistinguível.

export type Urgencia = "nenhuma" | "recente" | "atencao" | "critica";

/** Espera = a última mensagem foi do LEAD e ninguém respondeu depois. */
export function esperandoDesde(
  lastInboundAt: string | null,
  lastOutboundAt: string | null,
): number | null {
  if (!lastInboundAt) return null;
  const entrada = Date.parse(lastInboundAt);
  if (Number.isNaN(entrada)) return null;
  const saida = lastOutboundAt ? Date.parse(lastOutboundAt) : null;
  if (saida !== null && !Number.isNaN(saida) && saida >= entrada) return null; // já respondido
  return entrada;
}

const MINUTO = 60_000, HORA = 60 * MINUTO, DIA = 24 * HORA;

/**
 * Faixas escolhidas pelo ritmo de quem vende por WhatsApp: até uma hora é
 * normal; passou do dia, o lead provavelmente já falou com o concorrente.
 */
export function urgenciaDe(desde: number | null, agora: number): Urgencia {
  if (desde === null) return "nenhuma";
  const d = agora - desde;
  if (d < HORA) return "recente";
  if (d < DIA) return "atencao";
  return "critica";
}

/** Rótulo curto, do jeito que se fala: "12min", "3h", "5d". */
export function rotuloEspera(desde: number | null, agora: number): string {
  if (desde === null) return "";
  const d = Math.max(0, agora - desde);
  if (d < MINUTO) return "agora";
  if (d < HORA) return `${Math.floor(d / MINUTO)}min`;
  if (d < DIA) return `${Math.floor(d / HORA)}h`;
  const dias = Math.floor(d / DIA);
  return dias > 99 ? "99d+" : `${dias}d`;
}
