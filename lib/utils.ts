import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Normaliza um nome para casamento robusto (frete por região ↔ município IBGE):
 * minúsculo, sem acento, sem pontuação, espaços colapsados. "Gravataí " → "gravatai".
 */
export function normalizeName(text: string): string {
  return (text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Converte uma data sem hora ("YYYY-MM-DD", vinda de <input type="date">) para
 * meio-dia UTC. Evita o clássico off-by-one: "2026-06-15" interpretado como
 * meia-noite UTC vira dia 14 em fusos negativos (BR = UTC-3). Meio-dia UTC cai
 * no mesmo dia do calendário em qualquer fuso entre -12h e +12h.
 * Aceita também ISO completo (normaliza para meio-dia UTC do mesmo dia UTC).
 */
export function parseDueDate(input: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  return new Date(input);
}

/** Último dia do mês (month = 1–12) ao meio-dia UTC — prazo "até o fim do mês". */
export function endOfMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0));
}

export function isOverdue(dueDate: Date | string): boolean {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return due < new Date() && due.toDateString() !== new Date().toDateString();
}

export function getDaysUntilDue(dueDate: Date | string): number {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const today = new Date();
  const diff = due.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
