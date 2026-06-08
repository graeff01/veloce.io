// Utilitário de timezone por tenant. Sem dependências: usa Intl para converter
// entre instante (UTC) e "relógio de parede" no fuso do cliente.

const PAD = (n: number) => String(n).padStart(2, "0");

// Offset (minutos) do fuso `tz` no instante `date`.
function offsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return (asUTC - date.getTime()) / 60000;
}

export interface TzParts { weekday: number; minutes: number; ymd: string } // weekday 0=Dom; minutes = min do dia; ymd "AAAA-MM-DD"

// Partes de relógio de parede de um instante, no fuso do tenant.
export function tzParts(instant: Date, tz: string): TzParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value;
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = map.hour === "24" ? 0 : +map.hour;
  return {
    weekday: wdMap[map.weekday] ?? 0,
    minutes: hour * 60 + +map.minute,
    ymd: `${map.year}-${map.month}-${map.day}`,
  };
}

// "Agora" no fuso do tenant.
export function nowParts(tz: string): TzParts { return tzParts(new Date(), tz); }

// Relógio de parede no fuso do tenant -> instante (UTC).
// dateStr "AAAA-MM-DD", timeStr "HH:MM".
export function wallToInstant(dateStr: string, timeStr: string, tz: string): Date {
  const [hh, mm] = timeStr.split(":").map(Number);
  const guess = new Date(`${dateStr}T${PAD(hh)}:${PAD(mm || 0)}:00Z`);
  // Ajusta pelo offset do fuso naquele instante (1 iteração resolve fora de transição de DST).
  const off = offsetMinutes(guess, tz);
  return new Date(guess.getTime() - off * 60000);
}

// Weekday (0=Dom) de uma data-calendário "AAAA-MM-DD" (independente de fuso).
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
