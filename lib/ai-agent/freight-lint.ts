// Validador de acurácia do cadastro de FRETE. Roda sobre rules.freight e aponta
// armadilhas ANTES de virarem cobrança/pergunta errada — a mesma classe de problema
// que o resolveFreight sofre. Usa os MESMOS helpers do resolvedor (baseCityName,
// cityKeyOf, normText) para raciocinar com a lógica real de agrupamento, sem divergir.
//
// Níveis:
//   "erro"  → vai resolver ERRADO ou falhar (precisa corrigir).
//   "aviso" → funciona, mas fica frágil / a IA vai perguntar muito (revisar).
import { type FreightRegion, baseCityName, cityKeyOf, normText } from "./pricing";

export type FreightIssueLevel = "erro" | "aviso";
export interface FreightIssue {
  level: FreightIssueLevel;
  code: string;      // slug curto p/ agrupar/testar
  message: string;   // texto pronto p/ mostrar ao admin
  region?: string;   // região envolvida (quando aplicável)
}

// Palavras genéricas que, sozinhas como apelido, colidem entre cidades/zonas.
const GENERIC_ALIAS = new Set([
  "sul", "norte", "leste", "oeste", "centro", "central", "rural",
  "novo", "nova", "velho", "velha", "industrial", "cidade", "vila", "bairro",
]);

// Ordena erros antes de avisos (mantém estável no resto).
function bySeverity(a: FreightIssue, b: FreightIssue): number {
  if (a.level === b.level) return 0;
  return a.level === "erro" ? -1 : 1;
}

export function lintFreight(freight: FreightRegion[] | undefined | null): FreightIssue[] {
  const list = freight ?? [];
  const issues: FreightIssue[] = [];
  if (!list.length) return issues;

  // ── E1: valor ausente/inválido ────────────────────────────────────────────
  for (const f of list) {
    if (f.amount == null || !(typeof f.amount === "number") || !(f.amount > 0)) {
      issues.push({ level: "erro", code: "valor-invalido", region: f.region,
        message: `"${f.region}": valor do frete ausente ou inválido (${String(f.amount)}). Cadastre um valor > 0.` });
    }
  }

  // ── E2: zona/região duplicada na mesma cidade ─────────────────────────────
  // Duas regiões com a MESMA cidade e o MESMO rótulo de zona: o resolvedor pode
  // pegar qualquer uma → cobrança imprevisível.
  const seenZone = new Map<string, string>(); // cityKey|zone → primeira region
  for (const f of list) {
    const k = `${cityKeyOf(f)}|${normText(f.zone ?? "")}`;
    const prev = seenZone.get(k);
    if (prev) {
      issues.push({ level: "erro", code: "zona-duplicada", region: f.region,
        message: `"${f.region}" duplica a mesma cidade/zona de "${prev}". Remova a duplicata ou diferencie a zona.` });
    } else {
      seenZone.set(k, f.region);
    }
  }

  // ── E3: mesma cidade que NÃO vai agrupar (código IBGE divergente) ─────────
  // Regiões com o mesmo nome-base de cidade mas cityKey diferente (uma tem code,
  // outra não, ou codes diferentes) são tratadas como CIDADES SEPARADAS pelo
  // resolvedor → a lógica de "várias zonas → perguntar" nunca dispara.
  const byName = new Map<string, FreightRegion[]>();
  for (const f of list) {
    const n = normText(baseCityName(f));
    (byName.get(n) ?? byName.set(n, []).get(n)!).push(f);
  }
  for (const [, regs] of byName) {
    if (regs.length < 2) continue;
    const keys = new Set(regs.map(cityKeyOf));
    if (keys.size > 1) {
      issues.push({ level: "erro", code: "cidade-nao-agrupa", region: regs[0].region,
        message: `As zonas de "${baseCityName(regs[0])}" (${regs.map((r) => r.region).join(", ")}) têm código IBGE divergente/ausente e NÃO serão agrupadas — o sistema vai tratá-las como cidades diferentes. Use o MESMO code em todas as zonas da cidade.` });
    }
  }

  // ── A1: bairro genérico compartilhado entre cidades ───────────────────────
  // Um bairro (neighborhood) cujo nome aparece em cidades diferentes: sem a cidade
  // no endereço, o sistema não consegue decidir e não cobra (pede a cidade). Avisar
  // p/ o admin saber que aquele bairro é ambíguo.
  const nbCities = new Map<string, Set<string>>();
  for (const f of list) for (const nb of f.neighborhoods ?? []) {
    const n = normText(nb.name); if (!n) continue;
    (nbCities.get(n) ?? nbCities.set(n, new Set()).get(n)!).add(cityKeyOf(f));
  }
  for (const [name, cities] of nbCities) {
    if (cities.size > 1) {
      issues.push({ level: "aviso", code: "bairro-ambiguo",
        message: `O bairro "${name}" está cadastrado em ${cities.size} cidades diferentes — sem a cidade no endereço, o sistema vai PEDIR a cidade (não chuta). Confirme se é intencional.` });
    }
  }

  // ── A2: zona sem bairro nem apelido em cidade com várias zonas ────────────
  // Só será resolvida se o cliente digitar o rótulo EXATO da zona → pergunta demais.
  const byCity = new Map<string, FreightRegion[]>();
  for (const f of list) (byCity.get(cityKeyOf(f)) ?? byCity.set(cityKeyOf(f), []).get(cityKeyOf(f))!).push(f);
  for (const [, regs] of byCity) {
    if (regs.length < 2) continue; // só cidades multi-zona
    for (const f of regs) {
      const hasNb = (f.neighborhoods ?? []).some((n) => normText(n.name));
      const hasAlias = (f.aliases ?? []).some((a) => normText(a));
      if (!hasNb && !hasAlias) {
        issues.push({ level: "aviso", code: "zona-sem-bairro", region: f.region,
          message: `"${f.region}" é uma zona de cidade com várias zonas, mas não tem bairros nem apelidos cadastrados — só resolve se o cliente digitar o rótulo exato da zona. Cadastre os bairros dessa zona.` });
      }
    }
  }

  // ── A3: apelido genérico/curto propenso a colisão ─────────────────────────
  // Apelido é override GLOBAL: se for uma palavra genérica ("sul", "centro") vai
  // casar endereços de outras cidades.
  for (const f of list) for (const a of f.aliases ?? []) {
    const n = normText(a); if (!n) continue;
    const oneWord = !n.includes(" ");
    if (oneWord && (n.length <= 3 || GENERIC_ALIAS.has(n))) {
      issues.push({ level: "aviso", code: "apelido-generico", region: f.region,
        message: `"${f.region}": o apelido "${a}" é genérico e vale globalmente — pode casar endereços de outras cidades. Prefira um apelido específico (nome de distrito) ou use o campo de zona.` });
    }
  }

  // ── A4: apelido que colide com o NOME de outra cidade ─────────────────────
  // Ex.: apelido "canoas" numa zona de POA → "sou de canoas" cairia em POA.
  const cityNames = new Map<string, string>(); // normBaseName → cityKey
  for (const f of list) cityNames.set(normText(baseCityName(f)), cityKeyOf(f));
  for (const f of list) for (const a of f.aliases ?? []) {
    const n = normText(a); if (!n) continue;
    const owner = cityKeyOf(f);
    const collidesWith = cityNames.get(n);
    if (collidesWith && collidesWith !== owner) {
      issues.push({ level: "erro", code: "apelido-colide-cidade", region: f.region,
        message: `"${f.region}": o apelido "${a}" é igual ao nome de outra cidade cadastrada — endereços dessa cidade seriam cobrados como "${f.region}". Remova esse apelido.` });
    }
  }

  return issues.sort(bySeverity);
}

// Resumo legível (p/ CLI/script): "N erro(s), M aviso(s)" + linhas.
export function formatFreightLint(issues: FreightIssue[]): string {
  const erros = issues.filter((i) => i.level === "erro").length;
  const avisos = issues.length - erros;
  const head = issues.length ? `${erros} erro(s), ${avisos} aviso(s):` : "cadastro de frete OK — nenhum problema encontrado.";
  const lines = issues.map((i) => `  ${i.level === "erro" ? "✖" : "⚠"} [${i.code}] ${i.message}`);
  return [head, ...lines].join("\n");
}
