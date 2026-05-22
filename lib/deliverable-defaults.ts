export const DELIVERABLE_DEFAULTS: Record<
  string,
  { deadlineDayOfMonth: number; priority: string; checklistItems: string[] }
> = {
  "Post Feed": {
    deadlineDayOfMonth: 20,
    priority: "NORMAL",
    checklistItems: ["Brief", "Arte", "Copy", "Aprovacao", "Agendamento"],
  },
  "Reels": {
    deadlineDayOfMonth: 15,
    priority: "HIGH",
    checklistItems: ["Roteiro", "Gravacao", "Edicao", "Aprovacao", "Publicacao"],
  },
  "Story": {
    deadlineDayOfMonth: 25,
    priority: "LOW",
    checklistItems: ["Arte", "Copy", "Aprovacao"],
  },
  "Campanha": {
    deadlineDayOfMonth: 5,
    priority: "HIGH",
    checklistItems: ["Setup", "Criativos", "Revisao", "Subida", "Monitoramento"],
  },
  "Criativo": {
    deadlineDayOfMonth: 10,
    priority: "NORMAL",
    checklistItems: ["Brief criativo", "Producao", "Revisao", "Aprovacao"],
  },
  "Relatorio": {
    deadlineDayOfMonth: 0,
    priority: "HIGH",
    checklistItems: ["Coleta de dados", "Analise", "Documento", "Envio ao cliente"],
  },
  "Copy": {
    deadlineDayOfMonth: 18,
    priority: "NORMAL",
    checklistItems: ["Brief", "Redacao", "Revisao", "Aprovacao"],
  },
};

export function calcDueDate(
  year: number,
  month: number,
  deadlineDayOfMonth: number | null | undefined
): Date {
  const lastDay = new Date(year, month, 0).getDate();
  const day = deadlineDayOfMonth === 0 || !deadlineDayOfMonth
    ? lastDay
    : Math.min(deadlineDayOfMonth, lastDay);
  return new Date(year, month - 1, day);
}
