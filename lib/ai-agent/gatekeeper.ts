import type { Window } from "@/lib/visit-availability";
import { nowParts } from "@/lib/tz";

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

export function isWithinBusinessHours(windows: Window[], weekday: number, minutes: number): boolean {
  return (windows ?? []).some((w) => w.weekday === weekday && minutes >= toMin(w.start) && minutes < toMin(w.end));
}

interface CfgLike { enabled: boolean; status: string; businessHours: unknown; timezone: string; paused?: boolean; testMode?: boolean; answerMode?: string }

// Decide se a IA deve assumir. Atua só: kill-switch global desligado, NÃO pausada pelo
// cliente, status "live", habilitada e — conforme answerMode — 24h ou só FORA do horário.
export function shouldRespond(cfg: CfgLike | null, opts?: { engaged?: boolean }): { respond: boolean; reason: string } {
  if (process.env.AI_AGENT_KILL === "1") return { respond: false, reason: "kill-switch global" };
  if (!cfg || !cfg.enabled) return { respond: false, reason: "agente desligado" };
  if (cfg.paused) return { respond: false, reason: "pausado pelo cliente (kill-switch)" };
  if (cfg.status !== "live") return { respond: false, reason: `status ${cfg.status} (não está em produção)` };

  // Modo MANUAL (PRD sob demanda): a IA fica calada no automático — só atua nos leads que o
  // vendedor ENGAJOU clicando "IA Atender" (contact.aiEngaged). Uma vez engajado, a IA
  // COMPLETA o atendimento sozinha (responde as próximas mensagens do lead) até o vendedor
  // mandar uma mensagem, que a desengaja. Precedência sobre canário/horário.
  if (cfg.answerMode === "manual") return opts?.engaged
    ? { respond: true, reason: "modo manual — lead engajado pelo vendedor (IA completa o atendimento)" }
    : { respond: false, reason: "modo manual (lead não engajado — só via botão IA Atender)" };

  // Canário: ignora o horário comercial para permitir validar em PRD a qualquer hora.
  // Seguro — o respond.ts filtra e só responde os números de teste; nenhum lead real é tocado.
  if (cfg.testMode) return { respond: true, reason: "canário (ignora horário)" };

  // Modos 24h: atende inclusive dentro do horário comercial. No "ads_in_hours" o
  // ESCOPO muda por horário (respond.ts): dentro do horário só anúncio, fora todos.
  if (cfg.answerMode === "always" || cfg.answerMode === "ads_in_hours") return { respond: true, reason: "atende 24h" };

  const hours = (cfg.businessHours as Window[]) ?? [];
  if (hours.length === 0) return { respond: false, reason: "horário comercial não configurado" };

  const { weekday, minutes } = nowParts(cfg.timezone || "America/Sao_Paulo");
  if (isWithinBusinessHours(hours, weekday, minutes)) return { respond: false, reason: "dentro do horário comercial" };
  return { respond: true, reason: "fora do horário comercial" };
}
