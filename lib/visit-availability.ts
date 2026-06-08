// Disponibilidade de visitas (slots) — base do agendamento seguro.
export type Window = { weekday: number; start: string; end: string }; // weekday 0=Dom..6=Sáb, "HH:MM"
export interface VisitCfg { slotMinutes: number; capacityPerSlot: number; windows: Window[] }

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// Slots livres ("HH:MM") de uma data, considerando janelas + capacidade.
export function slotsForDate(cfg: VisitCfg, date: Date, bookedTimes: Date[]): string[] {
  const wd = date.getDay();
  const wins = (cfg.windows ?? []).filter((w) => w.weekday === wd);
  const used = new Map<number, number>();
  for (const b of bookedTimes) {
    const k = b.getHours() * 60 + b.getMinutes();
    used.set(k, (used.get(k) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const w of wins) {
    for (let t = toMin(w.start); t + cfg.slotMinutes <= toMin(w.end); t += cfg.slotMinutes) {
      if ((used.get(t) ?? 0) < cfg.capacityPerSlot) out.push(fmt(t));
    }
  }
  return out;
}

// Valida que um horário cai num slot válido (dentro da janela, alinhado, com vaga).
export function isSlotAvailable(cfg: VisitCfg, dt: Date, sameSlotBookedCount: number): boolean {
  const wd = dt.getDay();
  const minute = dt.getHours() * 60 + dt.getMinutes();
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
