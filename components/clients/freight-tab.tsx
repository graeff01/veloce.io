"use client";

// Aba "Frete" — mapa (choropleth) dos municípios do RS colorido pela faixa de preço
// do frete, e editor visual do rules.freight (que hoje só era editável no banco).
// Mesma fonte que a IA usa p/ cotar (PricingConfig.rules.freight). SVG na mão, sem
// lib de mapa. O vínculo região→município (code IBGE) é auto-inferido pelo nome e
// gravado ao salvar; assim o mapa pinta mesmo antes de o code existir no banco.
import { useEffect, useMemo, useState } from "react";
import { Truck, Save, Plus, Trash2, MapPin, Search } from "lucide-react";
import { normalizeName } from "@/lib/utils";

// rules.freight[] — espelha FreightRegion de lib/ai-agent/pricing.ts.
type Freight = { region: string; amount: number; aliases?: string[]; code?: string | null; assembly?: "optional" | "required" };
type Rules = { base?: unknown; options?: unknown; fees?: unknown; freight?: Freight[]; freightDefault?: number; [k: string]: unknown };

// Faixas de cor (verde → vermelho). Locais — não persistem (derivam do valor).
const BANDS = [
  { max: 150, color: "#16a34a", label: "≤ R$150" },
  { max: 300, color: "#eab308", label: "R$150–300" },
  { max: 450, color: "#f97316", label: "R$300–450" },
  { max: Infinity, color: "#dc2626", label: "R$450+" },
];
const bandColor = (amount: number) => BANDS.find((b) => amount <= b.max)?.color ?? "#9ca3af";
const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;

// ── Auto-match região → município IBGE ────────────────────────────────────────
const NAME_FIXES: Record<string, string> = { "sapucaia": "sapucaia do sul" };
const ZONE_SUFFIXES: RegExp[] = [/\s+extremo\s+sul$/i, /\s+zona\s+rural$/i, /\s+rural$/i, /\s+zona\s+sul$/i, /\s+zs$/i, /\s+zr$/i];
function citySlugOf(region: string): string {
  let city = region.trim();
  for (const re of ZONE_SUFFIXES) if (re.test(city)) { city = city.replace(re, "").trim(); break; }
  const slug = normalizeName(city);
  return NAME_FIXES[slug] ?? slug;
}

// ── Geo ───────────────────────────────────────────────────────────────────────
type GeoFeature = { properties: { code: string; name: string; slug: string; centroid: [number, number] }; geometry: { type: string; coordinates: unknown } };
type Geo = { features: GeoFeature[] };
const W = 780, H = 700, PAD = 10;

function useProjectedGeo() {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/geo/rs-municipios.geojson").then((r) => r.json()).then((g) => { if (on) setGeo(g); }).catch(() => {});
    return () => { on = false; };
  }, []);
  return useMemo(() => {
    if (!geo) return null;
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    const each = (c: unknown, cb: (lng: number, lat: number) => void) => {
      const a = c as number[];
      if (typeof a[0] === "number") cb(a[0], a[1]); else for (const x of c as unknown[]) each(x, cb);
    };
    for (const f of geo.features) each(f.geometry.coordinates, (lng, lat) => {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    });
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const x0 = minLng * k, x1 = maxLng * k, y0 = -maxLat, y1 = -minLat;
    const scale = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
    const ox = (W - (x1 - x0) * scale) / 2, oy = (H - (y1 - y0) * scale) / 2;
    const project = (lng: number, lat: number): [number, number] => [ox + (lng * k - x0) * scale, oy + (-lat - y0) * scale];
    const ring = (r: number[][]) => r.map(([lng, lat], i) => `${i ? "L" : "M"}${project(lng, lat).map((n) => n.toFixed(1)).join(",")}`).join("") + "Z";
    const toPath = (f: GeoFeature) => f.geometry.type === "Polygon"
      ? (f.geometry.coordinates as number[][][]).map(ring).join("")
      : (f.geometry.coordinates as number[][][][]).map((poly) => poly.map(ring).join("")).join("");
    const paths = geo.features.map((f) => ({ code: f.properties.code, name: f.properties.name, slug: f.properties.slug, d: toPath(f) }));
    const codeBySlug = new Map(geo.features.map((f) => [f.properties.slug, f.properties.code]));
    const nameByCode = new Map(geo.features.map((f) => [f.properties.code, f.properties.name]));
    return { paths, project, codeBySlug, nameByCode };
  }, [geo]);
}

// ── Componente ────────────────────────────────────────────────────────────────
export function FreightTab({ clientId }: { clientId: string }) {
  const geo = useProjectedGeo();
  const [rules, setRules] = useState<Rules | null>(null);
  const [freight, setFreight] = useState<Freight[]>([]);
  const [selCode, setSelCode] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; text: string; x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`/api/clients/${clientId}/ai/pricing`).then((r) => r.json()).then((pc) => {
      const rs = (pc?.rules ?? {}) as Rules;
      setRules(rs);
      setFreight(Array.isArray(rs.freight) ? rs.freight.map((f) => ({ ...f })) : []);
    }).catch(() => {});
  }, [clientId]);

  // code IBGE de cada região (salvo ou inferido pelo nome).
  const codeOf = useMemo(() => {
    const idx = geo?.codeBySlug;
    return (f: Freight): string | null => f.code ?? (idx ? (idx.get(citySlugOf(f.region)) ?? null) : null);
  }, [geo]);

  const { byCode, colorByCode, requiredByCode, noPoly } = useMemo(() => {
    const byCode = new Map<string, number[]>(); // code -> índices em freight
    const noPoly: number[] = [];
    freight.forEach((f, i) => { const c = codeOf(f); if (c) { const a = byCode.get(c) ?? []; a.push(i); byCode.set(c, a); } else noPoly.push(i); });
    const colorByCode = new Map<string, string>();
    const requiredByCode = new Map<string, boolean>();
    for (const [c, idxs] of byCode) {
      colorByCode.set(c, bandColor(Math.min(...idxs.map((i) => freight[i].amount))));
      requiredByCode.set(c, idxs.some((i) => freight[i].assembly === "required"));
    }
    return { byCode, colorByCode, requiredByCode, noPoly };
  }, [freight, codeOf]);

  const searchHit = useMemo(() => {
    if (!q.trim() || !geo) return null;
    const s = normalizeName(q);
    return geo.paths.find((p) => p.slug.includes(s))?.code ?? null;
  }, [q, geo]);

  if (!rules) return <div style={{ padding: 32, color: "var(--text-muted)" }}>Carregando frete…</div>;

  const mutate = (next: Freight[]) => { setFreight(next); setDirty(true); };
  async function save() {
    setSaving(true);
    try {
      // Cimenta o code inferido de cada região (durável) e grava rules inteiro.
      const enriched = freight.map((f) => ({ ...f, code: codeOf(f) }));
      const res = await fetch(`/api/clients/${clientId}/ai/pricing`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: { ...rules, freight: enriched } }),
      });
      if (res.ok) { setFreight(enriched); setDirty(false); }
    } finally { setSaving(false); }
  }

  const activeCode = selCode ?? searchHit;
  const activeName = activeCode ? (geo?.nameByCode.get(activeCode) ?? activeCode) : null;
  const selIdxs = activeCode ? (byCode.get(activeCode) ?? []) : [];

  const editAt = (i: number, patch: Partial<Freight>) => mutate(freight.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const removeAt = (i: number) => mutate(freight.filter((_, j) => j !== i));
  const addForActive = () => {
    if (!activeName || !activeCode) return;
    mutate([...freight, { region: activeName, amount: 0, code: activeCode, assembly: "optional" }]);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Truck size={18} />
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Frete por região</h2>
        <div style={{ flex: 1 }} />
        <button onClick={save} disabled={!dirty || saving}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", cursor: dirty ? "pointer" : "default", background: dirty ? "var(--accent, #2563eb)" : "var(--bg-surface)", color: dirty ? "#fff" : "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>
          <Save size={14} /> {saving ? "Salvando…" : dirty ? "Salvar alterações" : "Salvo"}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
        Cada município é pintado pela faixa de preço do frete. Clique num município para editar valor e montagem. É a mesma tabela que a IA usa para cotar (pela cidade de entrega).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20, alignItems: "start" }}>
        {/* ── Mapa ── */}
        <div style={{ position: "relative", background: "var(--bg-surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
            {BANDS.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, display: "inline-block" }} />{b.label}
              </span>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: "#e5e7eb", display: "inline-block" }} /> sem frete
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: "repeating-linear-gradient(45deg,#0000,#0000 3px,#111 3px,#111 4px)", border: "1px solid #999", display: "inline-block" }} /> montagem obrigatória
            </span>
          </div>

          {!geo ? (
            <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Carregando mapa do RS…</div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setHover(null)}>
              <defs>
                <pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(0,0,0,0.55)" strokeWidth="1.1" />
                </pattern>
              </defs>
              {geo.paths.map((p) => {
                const fill = colorByCode.get(p.code) ?? "#e5e7eb";
                const idxs = byCode.get(p.code);
                const isSel = p.code === activeCode;
                return (
                  <path key={p.code} d={p.d} fill={fill} stroke={isSel ? "#111" : "rgba(255,255,255,0.6)"} strokeWidth={isSel ? 1.6 : 0.4}
                    style={{ cursor: "pointer" }}
                    onClick={() => { setSelCode(p.code); setQ(""); }}
                    onMouseMove={(e) => {
                      const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      const txt = idxs ? idxs.map((i) => `${freight[i].region}: ${brl(freight[i].amount)}`).join(" · ") : "sem frete";
                      setHover({ name: p.name, text: txt, x: e.clientX - r.left, y: e.clientY - r.top });
                    }} />
                );
              })}
              {geo.paths.filter((p) => requiredByCode.get(p.code)).map((p) => (
                <path key={"h" + p.code} d={p.d} fill="url(#hatch)" pointerEvents="none" />
              ))}
            </svg>
          )}

          {hover && (
            <div style={{ position: "absolute", left: Math.min(hover.x + 12, W - 40), top: hover.y + 12, pointerEvents: "none", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,.15)", zIndex: 5, maxWidth: 260 }}>
              <strong>{hover.name}</strong><br />{hover.text}
            </div>
          )}
        </div>

        {/* ── Painel lateral ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
            <Search size={14} color="var(--text-muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar município…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--text-base)" }} />
          </div>

          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            {!activeCode ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "20px 8px" }}>
                <MapPin size={20} style={{ opacity: 0.5 }} /><br />Clique num município (ou busque) para ver e editar o frete.
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{activeName}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>cód. IBGE {activeCode}</div>
                {selIdxs.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>Sem frete cadastrado aqui.</div>}
                {selIdxs.map((i) => {
                  const f = freight[i];
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", borderTop: "1px dashed var(--border)" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={f.region} onChange={(e) => editAt(i, { region: e.target.value })}
                          style={{ flex: "1 1 90px", minWidth: 0, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-base)", fontSize: 12, color: "var(--text-base)" }} />
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>R$</span>
                        <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })}
                          style={{ width: 74, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-base)", fontSize: 12, color: "var(--text-base)" }} />
                        <button onClick={() => removeAt(i)} title="Remover" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--red, #dc2626)", display: "flex" }}><Trash2 size={14} /></button>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                        <input type="checkbox" checked={f.assembly === "required"} onChange={(e) => editAt(i, { assembly: e.target.checked ? "required" : "optional" })} />
                        montagem obrigatória
                      </label>
                    </div>
                  );
                })}
                <button onClick={addForActive} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: "1px dashed var(--border)", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--text-base)", width: "100%", justifyContent: "center" }}>
                  <Plus size={13} /> {selIdxs.length ? "Adicionar zona" : "Adicionar frete aqui"}
                </button>
              </>
            )}
          </div>

          {noPoly.length > 0 && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Sem município no mapa <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({noPoly.length})</span></div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Distritos/regiões que não são município (ex.: Ilha das Flores). A IA cota normal; só não pintam o mapa.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {noPoly.map((i) => {
                  const f = freight[i];
                  return (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ flex: 1, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.region}{f.assembly === "required" ? " ⚙" : ""}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>R$</span>
                      <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })}
                        style={{ width: 70, padding: "5px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-base)", fontSize: 12, color: "var(--text-base)" }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {freight.length} regiões cadastradas · {byCode.size} municípios no mapa
          </div>
        </div>
      </div>
    </div>
  );
}
