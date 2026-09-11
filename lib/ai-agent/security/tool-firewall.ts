// ── Camada de segurança · Anel 3: firewall de ferramentas ─────────────────────
// `executeTool` já é um switch FECHADO (inventar ferramenta é impossível) — o que
// faltava era tudo o que acontece ENTRE o JSON.parse do modelo e o corpo da tool.
// Hoje `args` chega como Record<string, unknown> sem validação, e cada case faz a
// própria coerção. Este wrapper envolve o executeTool SEM reescrevê-lo.
//
// Seis camadas: (1) esquema saneador, (2) allowlist do turno, (3) escopo de contato,
// (4) quota por turno, (5) idempotência de efeito externo, (6) timeout por tool.
//
// GARANTIA DE COMPORTAMENTO: para argumentos legítimos os esquemas são IDENTIDADE —
// eles saneiam (clamp/cap/coerção igual à que a tool já faz), nunca rejeitam. Quando
// algo é barrado, devolvemos um `result` textual neutro, exatamente o mesmo contrato
// que o executeTool já usa hoje para casos como "Ferramenta desconhecida.".

import { createHash } from "crypto";
import { z } from "zod";
import { executeTool, type ToolCtx, type ToolResult } from "../tools";
import { emitSecurityEventAsync } from "./events";

// ── Esquemas saneadores ───────────────────────────────────────────────────────
// Limites MUITO acima do uso real (um `motivo` legítimo tem ~80 chars, não 2000).

// Os saneadores TRUNCAM/CLAMPAM — nunca rejeitam. Usar `.max()` do Zod seria um erro
// aqui: ele VALIDA (e a falha cairia no `.catch`, apagando o valor inteiro), enquanto o
// que queremos é cortar o excesso preservando o começo, que é o dado útil.

/** String: espelha o `String(args.x)` que as tools já fazem + teto de tamanho. */
const S = (max: number) =>
  z.unknown().transform((v) => (v === undefined || v === null ? undefined : String(v).slice(0, max))).optional();

/** Número: espelha o `Number(args.x) || 0` das tools + faixa sã. */
const N = (min: number, max: number) =>
  z.unknown().transform((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return 0; // igual ao `|| 0` de hoje
    return Math.min(max, Math.max(min, n));
  }).optional();

/** Número sem clamp — para as tools que já clampam (ex.: quantidade 1..5). */
const NRaw = z.unknown().transform((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}).optional();

/** Booleano: NUNCA coage. As tools testam `typeof x === "boolean"` / `x === true`, então
 *  um "false" em string é IGNORADO hoje — coagir mudaria o orçamento. Não-booleano → sai. */
const B = z.unknown().transform((v) => (typeof v === "boolean" ? v : undefined)).optional();

const MAX_FREEFORM_KEYS = 40;
const MAX_FREEFORM_VALUE = 500;

/** Mapa livre (atualizar_ficha.campos, gerar_orcamento.quantidades): mantém as chaves
 *  do cliente mas limita quantidade e tamanho — a validação semântica continua sendo
 *  do sanitizeIntake (intake.ts), que não é tocado. */
const freeformMap = z.unknown().transform((v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, MAX_FREEFORM_KEYS)) {
    if (k.length > 80) continue;
    out[k] = typeof val === "string" ? val.slice(0, MAX_FREEFORM_VALUE) : val;
  }
  return out;
}).optional();

const strArray = (maxItems: number, maxLen: number) =>
  z.unknown().transform((v) => {
    if (!Array.isArray(v)) return undefined;
    return v.slice(0, maxItems).map((x) => String(x).slice(0, maxLen));
  }).optional();

const SCHEMAS: Record<string, z.ZodType<Record<string, unknown>>> = {
  buscar_estoque: z.object({
    termo: S(200),
    preco_de: N(0, 100_000_000).optional(),
    preco_ate: N(0, 100_000_000).optional(),
  }).strip(),

  atualizar_perfil: z.object({
    produto: S(300),
    orcamento: S(200),
    tem_troca: B,
    troca_veiculo: S(500),
    quer_financiamento: B,
    forma_pagamento: S(20),
    entrada: S(120),
    financiamento_detalhe: S(500),
    urgencia: S(200),
    quer_visitar: B,
    pronto_para_comprar: B,
    uso_motivacao: S(400),
    prioridade: S(300),
    estagio_decisao: S(120),
  }).strip(),

  enviar_foto: z.object({
    termo: S(200),
    quantidade: NRaw, // a tool já faz Math.max(1, Math.min(5, ...))
    interior: B,
  }).strip(),

  escalar_humano: z.object({ motivo: S(600) }).strip(),

  reagir: z.object({ emoji: S(8) }).strip(),

  enviar_localizacao_loja: z.object({}).strip(),
  enviar_opcionais: z.object({}).strip(),
  enviar_video: z.object({}).strip(),

  enviar_catalogo: z.object({ categoria: S(30) }).strip(),

  pedir_localizacao: z.object({ cidade: S(120) }).strip(),

  atualizar_ficha: z.object({ campos: freeformMap }).strip(),

  gerar_orcamento: z.object({
    base: strArray(30, 120),
    opcionais: strArray(60, 120),
    quantidades: freeformMap,
    montagem: B,
    pagamento: S(20),
    retirada: B,
    acesso: z.object({
      lances: N(0, 60), // teto são: o motor multiplica o valor por lance
      caracol: B,
      elevador: B,
      tipo: S(20),      // legado: tipo === "caracol"
    }).strip().optional(),
  }).strip(),

  enviar_orcamento: z.object({ quoteId: S(40) }).strip(),

  aprovar_orcamento: z.object({ motivo: S(600), quoteId: S(40) }).strip(),
};

/** Remove chaves cujo valor virou vazio pela coerção — mantém o `undefined` que a tool
 *  já espera (ex.: `args.termo` ausente vs. string vazia têm o mesmo efeito no código). */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/** Serialização estável (chaves ordenadas) — o Zod devolve as chaves na ordem do
 *  ESQUEMA, não na ordem em que o modelo mandou; sem ordenar, todo argumento válido
 *  seria marcado como "alterado" e a telemetria viraria ruído. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

export interface SanitizeOutcome { args: Record<string, unknown>; changed: boolean }

export function sanitizeToolArgs(name: string, raw: unknown): SanitizeOutcome {
  const input = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const schema = SCHEMAS[name];
  if (!schema) return { args: input, changed: false }; // tool desconhecida: o switch trata
  const parsed = schema.safeParse(input);
  const args = compact((parsed.success ? parsed.data : {}) as Record<string, unknown>);
  const changed = stable(args) !== stable(compact(input));
  return { args, changed };
}

// ── Quotas por TURNO ──────────────────────────────────────────────────────────
// Teto superior às travas ad-hoc que já existem (anti-reenvio de foto, vídeo 1×,
// loop guard). As travas atuais continuam mandando; isto é a rede embaixo delas.

const TURN_QUOTA: Record<string, number> = {
  enviar_foto: 3,
  enviar_video: 1,
  enviar_catalogo: 2,
  enviar_opcionais: 1,
  enviar_localizacao_loja: 1,
  pedir_localizacao: 1,
  reagir: 2,
  gerar_orcamento: 3,
  enviar_orcamento: 1,
  aprovar_orcamento: 1,
  escalar_humano: 2,
};
const DEFAULT_TURN_QUOTA = Number(process.env.SEC_TOOL_TURN_QUOTA || 8);
const TOTAL_TURN_QUOTA = Number(process.env.SEC_TOOL_TURN_TOTAL || 16);

// Ferramentas com efeito externo — recebem dedupe de idempotência.
const EXTERNAL_EFFECT = new Set([
  "enviar_foto", "enviar_video", "enviar_catalogo", "enviar_opcionais",
  "enviar_localizacao_loja", "pedir_localizacao", "reagir",
  "enviar_orcamento", "aprovar_orcamento",
]);

const TIMEOUT_MS: Record<string, number> = {
  gerar_orcamento: 20_000,
  enviar_orcamento: 25_000, // renderiza PDF
  enviar_foto: 20_000,      // até 5 uploads
  enviar_video: 20_000,
};
const DEFAULT_TIMEOUT_MS = Number(process.env.SEC_TOOL_TIMEOUT_MS || 12_000);

// Dedupe de efeito externo: (contactId, tool, hash(args)) → resultado, TTL curto.
const DEDUPE_TTL_MS = Number(process.env.SEC_TOOL_DEDUPE_MS || 60_000);
const dedupe = new Map<string, { at: number; result: ToolResult }>();
let lastSweep = 0;
function sweepDedupe(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of dedupe) if (now - v.at > DEDUPE_TTL_MS) dedupe.delete(k);
}

const neutral = (result: string): ToolResult => ({ result });

// ── Firewall (uma instância por TURNO) ────────────────────────────────────────

export interface FirewallOptions {
  turnId: string;
  blockedTools?: string[];
  /** shadow: registra violações mas deixa passar. enforce: aplica. */
  enforce?: boolean;
}

export class ToolFirewall {
  private counts = new Map<string, number>();
  private total = 0;

  constructor(private ctx: ToolCtx, private opts: FirewallOptions) {}

  private event(control: string, severity: "low" | "medium" | "high", action: "blocked" | "sanitized" | "observed", evidence: string, labels: string[]) {
    emitSecurityEventAsync({
      clientId: this.ctx.clientId, contactId: this.ctx.contactId, turnId: this.opts.turnId,
      ring: "tool", control, severity, action, evidence, labels, shadow: !this.opts.enforce,
    });
  }

  async run(name: string, rawArgs: unknown): Promise<ToolResult> {
    const enforce = this.opts.enforce !== false;

    // (1) Esquema saneador.
    const { args, changed } = sanitizeToolArgs(name, rawArgs);
    if (changed) {
      this.event("C-11:schema", "medium", enforce ? "sanitized" : "observed", `${name} ${JSON.stringify(rawArgs).slice(0, 200)}`, ["schema_violation", name]);
    }
    const effectiveArgs = enforce ? args : ((rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>);

    // (2) Allowlist do turno (política graduada).
    if (this.opts.blockedTools?.includes(name)) {
      this.event("C-11:allowlist", "high", "blocked", name, ["tool_blocked", name]);
      if (enforce) return neutral("Esta ação não está disponível agora. Siga a conversa normalmente por texto.");
    }

    // (3) Quota por turno.
    const used = this.counts.get(name) ?? 0;
    const quota = TURN_QUOTA[name] ?? DEFAULT_TURN_QUOTA;
    if (used >= quota || this.total >= TOTAL_TURN_QUOTA) {
      this.event("C-11:quota", "medium", "blocked", `${name} usada ${used}× neste turno`, ["tool_quota", name]);
      if (enforce) return neutral(`Você já usou esta ação neste turno — NÃO repita. Siga a conversa com o que já tem.`);
    }
    this.counts.set(name, used + 1);
    this.total++;

    // (4) Idempotência de efeito externo (anti-duplicação sob concorrência/retry).
    const now = Date.now();
    let dkey: string | null = null;
    if (EXTERNAL_EFFECT.has(name) && this.ctx.mode !== "test") {
      sweepDedupe(now);
      dkey = `${this.ctx.contactId}:${name}:${createHash("sha256").update(JSON.stringify(effectiveArgs)).digest("hex").slice(0, 16)}`;
      const hit = dedupe.get(dkey);
      if (hit && now - hit.at < DEDUPE_TTL_MS) {
        this.event("C-11:dedupe", "low", "blocked", name, ["tool_dedupe", name]);
        if (enforce) return hit.result;
      }
    }

    // (5) Timeout por ferramenta — uma tool pendurada não pode travar o turno inteiro
    //     (que segura conexão de banco e slot do semáforo do LLM).
    const budget = TIMEOUT_MS[name] ?? DEFAULT_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        executeTool(name, effectiveArgs, this.ctx),
        new Promise<ToolResult>((resolve) => {
          timer = setTimeout(() => resolve(neutral("Não consegui completar esta ação agora — siga a conversa por texto.")), budget);
        }),
      ]);
      if (dkey) dedupe.set(dkey, { at: now, result });
      return result;
    } catch (e) {
      // executeTool lança apenas em erro de contexto (tenant ausente). Mantém o turno vivo.
      this.event("C-11:error", "high", "blocked", `${name}: ${String(e).slice(0, 150)}`, ["tool_error", name]);
      return neutral("Não consegui completar esta ação agora — siga a conversa por texto.");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
