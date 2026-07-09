// ── Coleta estruturada configurável (F2) ─────────────────────────────────────
// O cliente define QUAIS campos a IA precisa coletar (AiAgentConfig.intakeSpec).
// A IA preenche via a ferramenta atualizar_ficha; aqui ficam os tipos e helpers
// puros (validação, campos faltantes, resumo) — sem I/O, fáceis de testar.

export interface IntakeField {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "boolean" | "option";
  options?: string[]; // para type "option"
}

export type IntakeData = Record<string, string | number | boolean>;

export function parseSpec(spec: unknown): IntakeField[] {
  if (!Array.isArray(spec)) return [];
  return spec.filter((f): f is IntakeField => !!f && typeof (f as IntakeField).key === "string" && typeof (f as IntakeField).label === "string");
}

// Campos obrigatórios ainda não preenchidos — a IA usa para saber o que perguntar.
export function missingRequired(spec: IntakeField[], data: IntakeData): IntakeField[] {
  return spec.filter((f) => f.required && (data[f.key] === undefined || data[f.key] === "" || data[f.key] === null));
}

// Filtra/normaliza o que a IA mandou para as chaves conhecidas do spec (ignora ruído).
export function sanitizeIntake(spec: IntakeField[], incoming: Record<string, unknown>): { data: IntakeData; invalidOptions: string[] } {
  const keys = new Map(spec.map((f) => [f.key, f]));
  const data: IntakeData = {};
  const invalidOptions: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    const field = keys.get(k);
    if (!field || v === undefined || v === null || v === "") continue;
    if (field.type === "number") { const n = Number(v); if (!Number.isNaN(n)) data[k] = n; continue; }
    if (field.type === "boolean") { data[k] = v === true || v === "true" || v === "sim"; continue; }
    if (field.type === "option" && field.options && !field.options.includes(String(v))) { invalidOptions.push(`${k}=${v}`); continue; }
    data[k] = typeof v === "boolean" || typeof v === "number" ? v : String(v);
  }
  return { data, invalidOptions };
}

export function summarizeIntake(spec: IntakeField[], data: IntakeData): string {
  return spec
    .filter((f) => data[f.key] !== undefined && data[f.key] !== "")
    .map((f) => `${f.label}: ${data[f.key]}`)
    .join("; ");
}
