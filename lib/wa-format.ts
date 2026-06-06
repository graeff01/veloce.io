// Formatadores client-safe (sem dependência de servidor).

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}

export const FUNNEL_LABELS: Record<string, string> = {
  recebido: "Recebidos",
  respondido: "Respondidos",
  qualificado: "Qualificados",
  negociacao: "Em negociação",
  perdido: "Perdidos",
  convertido: "Convertidos",
};
