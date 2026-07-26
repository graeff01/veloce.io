// ── Equivalência comportamental entre dois runs da simulação ────────────────────
// Princípio permanente da Veloce IA: otimizar a arquitetura NUNCA o atendimento. Este
// módulo compara um run CANDIDATO (com uma otimização) contra o BASELINE congelado e
// decide se o comportamento permaneceu equivalente. A "assinatura" de um turno é o que o
// cliente OBSERVA — a decisão, as tools chamadas e os artefatos enviados (vídeo, catálogo,
// PDF, foto). O TEXTO pode variar (o gpt-4o-mini não é 100% determinístico nem em temp 0);
// só divergência ESTRUTURAL conta como mudança de comportamento. Helpers puros (testáveis).

export interface SimTurn { lead?: string; ia?: string; decision?: string; status?: string; tools?: string[]; artifacts?: string[] }

export interface TurnSignature { decision: string; tools: string[]; artifacts: string[] }

export function turnSignature(t: SimTurn): TurnSignature {
  return {
    decision: t.decision ?? "",
    tools: [...(t.tools ?? [])].sort(),
    artifacts: [...(t.artifacts ?? [])].sort(),
  };
}

const eqArr = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// Dois turnos são comportamentalmente equivalentes se a decisão, o conjunto de tools e o
// conjunto de artefatos batem. O texto NÃO entra (variação de wording ≠ mudança de conduta).
export function turnsEquivalent(a: SimTurn, b: SimTurn): { equal: boolean; diffs: string[] } {
  const sa = turnSignature(a), sb = turnSignature(b);
  const diffs: string[] = [];
  if (sa.decision !== sb.decision) diffs.push(`decisão: ${sa.decision} → ${sb.decision}`);
  if (!eqArr(sa.tools, sb.tools)) diffs.push(`tools: [${sa.tools}] → [${sb.tools}]`);
  if (!eqArr(sa.artifacts, sb.artifacts)) diffs.push(`artefatos: [${sa.artifacts}] → [${sb.artifacts}]`);
  return { equal: diffs.length === 0, diffs };
}

export interface ConvoDiff { turnsTotal: number; turnsEqual: number; divergences: { turn: number; diffs: string[] }[] }

// Alinha por índice de turno (o replay é determinístico na sequência de mensagens do lead).
export function compareConversation(base: SimTurn[], cand: SimTurn[]): ConvoDiff {
  const n = Math.max(base.length, cand.length);
  const divergences: { turn: number; diffs: string[] }[] = [];
  let turnsEqual = 0;
  for (let i = 0; i < n; i++) {
    const b = base[i], c = cand[i];
    if (!b || !c) { divergences.push({ turn: i, diffs: [`turno ausente (${b ? "candidato" : "baseline"})`] }); continue; }
    const { equal, diffs } = turnsEquivalent(b, c);
    if (equal) turnsEqual++; else divergences.push({ turn: i, diffs });
  }
  return { turnsTotal: n, turnsEqual, divergences };
}

// Contagem agregada dos EVENTOS de atendimento que o usuário mencionou como invariantes
// (momento de vídeo/catálogo/PDF/foto/escala). Um resumo que precisa bater no total.
export function atendimentoEvents(turns: SimTurn[]): Record<string, number> {
  const has = (t: SimTurn, name: string) => (t.tools ?? []).includes(name);
  const hasArt = (t: SimTurn, kind: string) => (t.artifacts ?? []).includes(kind);
  const ev = { video: 0, catalogo: 0, pdf: 0, foto: 0, opcionais: 0, escala: 0, localizacao: 0 };
  for (const t of turns) {
    if (has(t, "enviar_video")) ev.video++;
    if (has(t, "enviar_catalogo")) ev.catalogo++;
    if (has(t, "enviar_orcamento") || hasArt(t, "pdf")) ev.pdf++;
    if (has(t, "enviar_foto")) ev.foto++;
    if (has(t, "enviar_opcionais")) ev.opcionais++;
    if (has(t, "escalar_humano") || has(t, "aprovar_orcamento")) ev.escala++;
    if (has(t, "pedir_localizacao")) ev.localizacao++;
  }
  return ev;
}
