// Regras puras do login+senha do portal (testáveis, sem I/O).
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

export function validatePassword(pw: unknown): { ok: boolean; error?: string } {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) return { ok: false, error: `A senha precisa de ao menos ${MIN_PASSWORD} caracteres.` };
  if (pw.length > MAX_PASSWORD) return { ok: false, error: "Senha muito longa." };
  return { ok: true };
}

export function validEmail(e: unknown): boolean {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// Teto de usuários por painel (conta só quem já tem senha = usuário efetivo).
export function slotsLeft(registered: number, maxUsers: number): number {
  return Math.max(0, (maxUsers || 0) - (registered || 0));
}
export function canRegister(registered: number, maxUsers: number): boolean {
  return slotsLeft(registered, maxUsers) > 0;
}
