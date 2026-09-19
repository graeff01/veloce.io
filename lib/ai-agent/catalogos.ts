// ── Catálogos em PDF por categoria ────────────────────────────────────────────
// Mandar 43 páginas para quem quer uma coisa só é ruim de ler no celular. Aqui
// cada categoria aponta para um RECORTE do catálogo do cliente — as páginas dele,
// com o design dele (ver scripts/jr-catalogo-recortes.ts, que gera offline).
//
// Mora em PricingConfig.rules.catalogos, seguindo o caminho que o PDF de lareiras
// já usava (rules.lareirasPdfUrl) — assim não precisa de migração e continua
// configurável por cliente, sem nome de produto de ninguém dentro do motor.
//
// Compatibilidade: cliente SEM `catalogos` configurado se comporta exatamente
// como antes — as duas categorias antigas, resolvidas pelos mesmos campos.
//
// Módulo PURO — testável em tests/catalogos.test.ts.

export interface CatalogoPdf {
  /** identificador usado pelo modelo na tool call (sem espaço/acento) */
  chave: string;
  /** como descrever para o modelo escolher certo */
  rotulo: string;
  url: string;
}

const CHAVE_OK = /^[a-z][a-z0-9_]{1,30}$/;

/** Lê e valida a lista vinda de PricingConfig.rules.catalogos. Lixo é descartado. */
export function lerCatalogos(rules: unknown): CatalogoPdf[] {
  const bruto = (rules as { catalogos?: unknown } | null)?.catalogos;
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const out: CatalogoPdf[] = [];
  for (const item of bruto) {
    const c = item as Partial<CatalogoPdf> | null;
    const chave = String(c?.chave ?? "").trim().toLowerCase();
    const url = String(c?.url ?? "").trim();
    const rotulo = String(c?.rotulo ?? "").trim();
    // Chave malformada faria o enum da tool virar lixo; URL relativa não é
    // enviável pelo WhatsApp (a Meta busca o arquivo por conta dela).
    if (!CHAVE_OK.test(chave) || !/^https?:\/\//i.test(url) || !rotulo) continue;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ chave, rotulo, url });
  }
  return out;
}

/**
 * Resolve a categoria pedida pelo modelo.
 *
 * Precedência: recortes configurados primeiro, depois as duas categorias
 * históricas. Um cliente sem recortes cai exatamente no comportamento de antes.
 */
export function resolverCatalogo(
  categoria: string | undefined,
  cfg: { catalogos: CatalogoPdf[]; catalogPdfUrl?: string | null; lareirasPdfUrl?: string | null },
): { url: string; nome: string } | null {
  const pedida = String(categoria ?? "").trim().toLowerCase();

  const recorte = cfg.catalogos.find((c) => c.chave === pedida);
  if (recorte) return { url: recorte.url, nome: recorte.rotulo };

  if (pedida === "lareira") {
    const u = (cfg.lareirasPdfUrl ?? "").trim();
    return u ? { url: u, nome: "lareiras" } : null;
  }
  // Padrão histórico: qualquer outra coisa (inclusive vazio) é o catálogo completo.
  const u = (cfg.catalogPdfUrl ?? "").trim();
  return u ? { url: u, nome: "churrasqueiras" } : null;
}

/** Categorias que o modelo pode pedir, para o enum da tool. */
export function categoriasDisponiveis(cfg: {
  catalogos: CatalogoPdf[]; catalogPdfUrl?: string | null; lareirasPdfUrl?: string | null;
}): string[] {
  const out = ["churrasqueira"];
  if ((cfg.lareirasPdfUrl ?? "").trim()) out.push("lareira");
  for (const c of cfg.catalogos) if (!out.includes(c.chave)) out.push(c.chave);
  return out;
}

/** Trecho que entra na descrição da tool, para o modelo escolher o recorte certo. */
export function descreverCatalogos(catalogos: CatalogoPdf[]): string {
  if (!catalogos.length) return "";
  return " A categoria 'churrasqueira' é o catálogo COMPLETO — use quando o cliente pedir \"o catálogo\", \"tudo\" ou \"o completo\"."
    + " RECORTES, para quando você JÁ sabe o que ele quer (mandam só aquela parte): "
    + catalogos.map((c) => `'${c.chave}' = ${c.rotulo}`).join("; ") + ".";
}
