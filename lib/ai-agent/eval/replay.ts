// ── Simulação por replay: helpers puros ────────────────────────────────────────
// Reproduz conversas REAIS alimentando a IA APENAS com as mensagens do CLIENTE,
// uma a uma, ignorando o vendedor humano — a IA responde do zero a cada turno.
// Aqui ficam os utilitários PUROS (agrupamento de turnos); o driver de I/O que roda
// o runAgent(mode:test) fica no script scripts/jr-simulation.ts. Ver docs.

export interface RawMsg { direction: string; text: string | null }

// Agrupa as mensagens do LEAD em TURNOS: mensagens consecutivas do cliente (antes de
// uma resposta) viram UM turno — igual ao debounce que coalesce rajadas em produção.
// As mensagens do vendedor (direction="out") são ignoradas, mas MARCAM a fronteira do
// turno (onde uma resposta aconteceu). Mídia entra como o texto/placeholder que já existe.
export function groupLeadTurns(messages: RawMsg[]): string[] {
  const turns: string[] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.length) { turns.push(cur.join("\n")); cur = []; } };
  for (const m of messages) {
    const t = (m.text ?? "").trim();
    if (m.direction === "in") { if (t) cur.push(t); }
    else flush(); // resposta do vendedor fecha o turno do lead corrente
  }
  flush();
  return turns;
}
