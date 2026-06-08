import type { Window } from "@/lib/visit-availability";

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

export function isWithinBusinessHours(windows: Window[], now: Date): boolean {
  const wd = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  return (windows ?? []).some((w) => w.weekday === wd && minute >= toMin(w.start) && minute < toMin(w.end));
}

interface CfgLike { enabled: boolean; businessHours: unknown }

// Decide se a IA deve assumir. Atua SÓ fora do horário comercial e se habilitada.
export function shouldRespond(cfg: CfgLike | null, now = new Date()): { respond: boolean; reason: string } {
  if (!cfg || !cfg.enabled) return { respond: false, reason: "agente desligado" };
  const hours = (cfg.businessHours as Window[]) ?? [];
  if (hours.length === 0) return { respond: false, reason: "horário comercial não configurado" };
  if (isWithinBusinessHours(hours, now)) return { respond: false, reason: "dentro do horário comercial" };
  return { respond: true, reason: "fora do horário comercial" };
}
