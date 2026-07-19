// ── Importador de tabela de frete (colar planilha) ───────────────────────────
// Pega o texto colado (uma região + preço por linha), parseia com tolerância ao
// formato brasileiro (R$ 1.234,56 / tabs / prefixo "Frete") e MONTA UM PREVIEW: o
// que é novo, o que muda de preço, o que fica igual e o que não casou com o IBGE.
// NADA é gravado sem o preview — é a garantia de "sem erros". O merge PRESERVA os
// bairros já cadastrados (não apaga o trabalho de zona).
import type { FreightRegion } from "./ai-agent/pricing";

const norm = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const NAME_FIXES: Record<string, string> = { "sapucaia": "sapucaia do sul" };

const ZONE_SUFFIXES: RegExp[] = [/\s+extremo\s+sul$/i, /\s+zona\s+rural$/i, /\s+rural$/i, /\s+zona\s+sul$/i, /\s+zona\s+norte$/i, /\s+zona\s+leste$/i, /\s+zona\s+oeste$/i, /\s+zs$/i, /\s+zr$/i, /\s+zl$/i, /\s+ze$/i, /\s+zn$/i, /\s+zo$/i];
const ZONE_LABEL: Record<string, string> = {
  "zs": "Zona Sul", "zona sul": "Zona Sul", "zn": "Zona Norte", "zona norte": "Zona Norte",
  "zl": "Zona Leste", "ze": "Zona Leste", "zona leste": "Zona Leste", "zo": "Zona Oeste", "zona oeste": "Zona Oeste",
  "zr": "Rural", "rural": "Rural", "zona rural": "Rural", "extremo sul": "Extremo Sul", "central": "Central", "centro": "Central",
};

function splitCityZone(region: string): { citySlug: string; zoneLabel: string; cityRaw: string } {
  let cityRaw = region.trim();
  let suffix = "";
  for (const re of ZONE_SUFFIXES) { const m = cityRaw.match(re); if (m) { suffix = m[0].trim(); cityRaw = cityRaw.replace(re, "").trim(); break; } }
  const slug = norm(cityRaw);
  return { citySlug: NAME_FIXES[slug] ?? slug, zoneLabel: ZONE_LABEL[norm(suffix)] ?? (suffix ? titleCase(suffix) : ""), cityRaw };
}

// "1.234,56" → 1234.56 · "60,00" → 60 · "60" → 60 · "410" → 410
function parseBRNumber(s: string): number | null {
  const clean = s.replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export type ParsedFreight = { region: string; amount: number };
// Preço no fim da linha: opcional "R$", milhar com ponto, decimal com vírgula.
const PRICE_RE = /(?:r\$)?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s*$/i;
// Cabeçalhos/lixo típicos da planilha (não são cidades).
const HEADER_RE = /^(preco|geral\b|obrigat|com montagem|montagem ou sem|frete geral)/i;

export function parseFreightTable(text: string): { rows: ParsedFreight[]; skipped: string[] } {
  const rows: ParsedFreight[] = [];
  const skipped: string[] = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let s = line.replace(/^frete\s+/i, "").trim();
    const m = s.match(PRICE_RE);
    let amount: number | null = null;
    if (m) { amount = parseBRNumber(m[1]); s = s.slice(0, m.index).trim(); }
    s = s.replace(/[\t;|]+$/, "").trim();
    if (!s) { skipped.push(line); continue; }
    if (amount == null) { skipped.push(`${line} — sem preço`); continue; }
    if (HEADER_RE.test(norm(s))) { skipped.push(line); continue; }
    rows.push({ region: s, amount });
  }
  return { rows, skipped };
}

export type GeoMaps = { codeBySlug: Map<string, string>; nameByCode: Map<string, string> };
export type ImportRow = { region: string; city: string; zone?: string; amount: number; code: string | null; status: "new" | "price" | "same" | "unmatched"; from?: number };

// Chave MUNICÍPIO+ZONA. Base (sem zona) ≡ "Central" — evita duplicar "Porto Alegre"
// (planilha) com "Porto Alegre — Central" (cadastro).
function keyOf(code: string | null, citySlug: string, zone: string): string { return `${code || citySlug}|${norm(zone) || "central"}`; }

// Monta o preview e o array já mesclado (a aplicar SÓ após confirmação).
export function buildImportPreview(existing: FreightRegion[], parsed: ParsedFreight[], geo: GeoMaps): { rows: ImportRow[]; merged: FreightRegion[] } {
  const merged: FreightRegion[] = existing.map((f) => ({ ...f }));
  const idxByKey = new Map<string, number>();
  merged.forEach((f, i) => {
    const citySlug = f.city ? norm(f.city) : splitCityZone(f.region).citySlug;
    idxByKey.set(keyOf(f.code ?? null, citySlug, f.zone || ""), i);
  });

  const rows: ImportRow[] = [];
  for (const p of parsed) {
    const { citySlug, zoneLabel } = splitCityZone(p.region);
    const code = geo.codeBySlug.get(NAME_FIXES[citySlug] ?? citySlug) ?? null;
    const city = (code ? geo.nameByCode.get(code) : null) || titleCase(citySlug);
    const zone = zoneLabel || undefined;
    const region = zone ? `${city} — ${zone}` : city;
    const k = keyOf(code, code ? norm(city) : citySlug, zone || "");
    const existIdx = idxByKey.get(k);
    if (existIdx != null) {
      const cur = merged[existIdx]; // mostra o nome JÁ cadastrado (deixa o match explícito)
      const disp = { region: cur.region, city: cur.city ?? city, zone: cur.zone ?? zone, amount: p.amount, code: cur.code ?? code };
      if (cur.amount !== p.amount) { rows.push({ ...disp, status: "price", from: cur.amount }); merged[existIdx] = { ...cur, amount: p.amount }; }
      else rows.push({ ...disp, status: "same" });
    } else {
      const status: ImportRow["status"] = code ? "new" : "unmatched";
      rows.push({ region, city, zone, amount: p.amount, code, status });
      merged.push({ region, city, zone, amount: p.amount, code, assembly: "optional" });
      idxByKey.set(k, merged.length - 1);
    }
  }
  return { rows, merged };
}
