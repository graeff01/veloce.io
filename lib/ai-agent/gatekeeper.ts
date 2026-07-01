import type { Window } from "@/lib/visit-availability";
import { nowParts } from "@/lib/tz";

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

export function isWithinBusinessHours(windows: Window[], weekday: number, minutes: number): boolean {
  return (windows ?? []).some((w) => w.weekday === weekday && minutes >= toMin(w.start) && minutes < toMin(w.end));
}

interface CfgLike { enabled: boolean; status: string; businessHours: unknown; timezone: string; paused?: boolean; testMode?: boolean }

// Decide se a IA deve assumir. Atua só: kill-switch global desligado, NÃO pausada pelo
// cliente, status "live", habilitada e FORA do horário comercial (no fuso do tenant).
export function shouldRespond(cfg: CfgLike | null): { respond: boolean; reason: string } {
  if (process.env.AI_AGENT_KILL === "1") return { respond: false, reason: "kill-switch global" };
  if (!cfg || !cfg.enabled) return { respond: false, reason: "agente desligado" };
  if (cfg.paused) return { respond: false, reason: "pausado pelo cliente (kill-switch)" };
  if (cfg.status !== "live") return { respond: false, reason: `status ${cfg.status} (não está em produção)` };

  // Canário: ignora o horário comercial para permitir validar em PRD a qualquer hora.
  // Seguro — o respond.ts filtra e só responde os números de teste; nenhum lead real é tocado.
  if (cfg.testMode) return { respond: true, reason: "canário (ignora horário)" };

  const hours = (cfg.businessHours as Window[]) ?? [];
  if (hours.length === 0) return { respond: false, reason: "horário comercial não configurado" };

  const { weekday, minutes } = nowParts(cfg.timezone || "America/Sao_Paulo");
  if (isWithinBusinessHours(hours, weekday, minutes)) return { respond: false, reason: "dentro do horário comercial" };
  return { respond: true, reason: "fora do horário comercial" };
}
