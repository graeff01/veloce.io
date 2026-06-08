// Disponibilidade de visitas (slots) — base do agendamento seguro, ciente de fuso.
import { tzParts, weekdayOf } from "@/lib/tz";

export type Window = { weekday: number; start: string; end: string }; // weekday 0=Dom..6=Sáb, "HH:MM"
export interface VisitCfg { slotMinutes: number; capacityPerSlot: number; windows: Window[] }

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// Slots livres ("HH:MM", relógio de parede do tenant) de uma data, com janelas + capacidade.
export function slotsForDate(cfg: VisitCfg, dateStr: string, bookedInstants: Date[], tz: string): string[] {
  const wd = weekdayOf(dateStr);
  const wins = (cfg.windows ?? []).filter((w) => w.weekday === wd);
  const used = new Map<number, number>();
  for (const b of bookedInstants) {
    const p = tzParts(b, tz);
    if (p.ymd !== dateStr) continue;
    used.set(p.minutes, (used.get(p.minutes) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const w of wins) {
    for (let t = toMin(w.start); t + cfg.slotMinutes <= toMin(w.end); t += cfg.slotMinutes) {
      if ((used.get(t) ?? 0) < cfg.capacityPerSlot) out.push(fmt(t));
    }
  }
  return out;
}

// Valida que (data, hora) cai num slot válido: dentro da janela, alinhado, com vaga.
export function isSlotAvailable(cfg: VisitCfg, dateStr: string, timeStr: string, sameSlotBookedCount: number): boolean {
  const wd = weekdayOf(dateStr);
  const minute = toMin(timeStr);
  const inWindow = (cfg.windows ?? []).some(
    (w) => w.weekday === wd
      && minute >= toMin(w.start)
      && minute + cfg.slotMinutes <= toMin(w.end)
      && (minute - toMin(w.start)) % cfg.slotMinutes === 0,
  );
  return inWindow && sameSlotBookedCount < cfg.capacityPerSlot;
}

// Janela padrão (Seg–Sáb, 9h–18h) para clientes sem config.
export const DEFAULT_WINDOWS: Window[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: "09:00", end: "18:00" }));
