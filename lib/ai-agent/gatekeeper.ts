import type { Window } from "@/lib/visit-availability";
import { nowParts } from "@/lib/tz";

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

export function isWithinBusinessHours(windows: Window[], weekday: number, minutes: number): boolean {
  return (windows ?? []).some((w) => w.weekday === weekday && minutes >= toMin(w.start) && minutes < toMin(w.end));
}

interface CfgLike { enabled: boolean; status: string; businessHours: unknown; timezone: string; alwaysOn?: boolean }

// Decide se a IA deve assumir. Atua só com: kill-switch global desligado, status
// "live" e habilitada. Por padrão, só FORA do horário comercial — mas com
// `alwaysOn` (F2) a IA vira primeira linha 24/7 (responde inclusive no expediente).
export function shouldRespond(cfg: CfgLike | null): { respond: boolean; reason: string } {
  if (process.env.AI_AGENT_KILL === "1") return { respond: false, reason: "kill-switch global" };
  if (!cfg || !cfg.enabled) return { respond: false, reason: "agente desligado" };
  if (cfg.status !== "live") return { respond: false, reason: `status ${cfg.status} (não está em produção)` };

  // Primeira linha 24/7: ignora o horário comercial (mantém o kill-switch acima).
  if (cfg.alwaysOn) return { respond: true, reason: "primeira linha 24/7" };

  const hours = (cfg.businessHours as Window[]) ?? [];
  if (hours.length === 0) return { respond: false, reason: "horário comercial não configurado" };

  const { weekday, minutes } = nowParts(cfg.timezone || "America/Sao_Paulo");
  if (isWithinBusinessHours(hours, weekday, minutes)) return { respond: false, reason: "dentro do horário comercial" };
  return { respond: true, reason: "fora do horário comercial" };
}
