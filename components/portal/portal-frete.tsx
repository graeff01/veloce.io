"use client";

// Seção "Frete" do portal do cliente — mapa 3D NAVEGÁVEL (MapLibre GL) dos 497
// municípios do RS. Cada município é um bloco extrudado: ALTURA = valor do frete,
// COR = faixa de preço. Zoom/pan/inclinação; clique pra editar/cadastrar. Edita o
// rules.freight (mesma tabela que a IA usa p/ cotar). Sem tiles externos — o mapa
// renderiza o GeoJSON local direto (self-contained).
import { useEffect, useMemo, useRef, useState } from "react";
import { Truck, Save, Plus, Trash2, MapPin, Search, RotateCcw } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, GeoJSONSource, Popup as MlPopup } from "maplibre-gl";

type Freight = { region: string; amount: number; aliases?: string[]; code?: string | null; assembly?: "optional" | "required" };
type GeoFeature = { type: "Feature"; properties: { code: string; name: string; slug: string; centroid: [number, number] }; geometry: unknown };
type Geo = { type: "FeatureCollection"; features: GeoFeature[] };

// Faixas de cor (verde → vermelho). Derivam do valor.
const BANDS = [
  { max: 150, color: "#16a34a", label: "≤ R$150" },
  { max: 300, color: "#eab308", label: "R$150–300" },
  { max: 450, color: "#f97316", label: "R$300–450" },
  { max: Infinity, color: "#dc2626", label: "R$450+" },
];
const NO_FREIGHT = "#c7ccd4";
const bandColor = (a: number) => BANDS.find((b) => a <= b.max)?.color ?? "#9ca3af";
const HEIGHT_SCALE = 22; // metros por R$1 (extrusão visível na escala do RS)
const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
const normalizeName = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, " ");

const NAME_FIXES: Record<string, string> = { "sapucaia": "sapucaia do sul" };
const ZONE_SUFFIXES: RegExp[] = [/\s+extremo\s+sul$/i, /\s+zona\s+rural$/i, /\s+rural$/i, /\s+zona\s+sul$/i, /\s+zs$/i, /\s+zr$/i];
function citySlugOf(region: string): string {
  let city = region.trim();
  for (const re of ZONE_SUFFIXES) if (re.test(city)) { city = city.replace(re, "").trim(); break; }
  const slug = normalizeName(city);
  return NAME_FIXES[slug] ?? slug;
}

export function PortalFrete({ token }: { token: string }) {
  const [freight, setFreight] = useState<Freight[] | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [selCode, setSelCode] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [ready, setReady] = useState(false);

  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popRef = useRef<MlPopup | null>(null);
  const selCodeRef = useRef<string | null>(null);
  const freightRef = useRef<Freight[]>([]);

  // ── Carrega frete + geojson ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/portal/${token}/freight`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      setFreight(Array.isArray(d?.freight) ? d.freight.map((f: Freight) => ({ ...f })) : []);
    }).catch(() => setFreight([]));
    fetch("/geo/rs-municipios.geojson").then((r) => r.json()).then(setGeo).catch(() => {});
  }, [token]);

  // code IBGE de cada região (salvo ou inferido pelo nome).
  const codeOf = useMemo(() => {
    const idx = geo ? new Map(geo.features.map((f) => [f.properties.slug, f.properties.code])) : null;
    return (f: Freight): string | null => f.code ?? (idx ? (idx.get(citySlugOf(f.region)) ?? null) : null);
  }, [geo]);

  const { byCode, noPoly, nameByCode, centroidByCode } = useMemo(() => {
    const byCode = new Map<string, number[]>();
    const noPoly: number[] = [];
    (freight ?? []).forEach((f, i) => { const c = codeOf(f); if (c) { const a = byCode.get(c) ?? []; a.push(i); byCode.set(c, a); } else noPoly.push(i); });
    const nameByCode = new Map((geo?.features ?? []).map((f) => [f.properties.code, f.properties.name]));
    const centroidByCode = new Map((geo?.features ?? []).map((f) => [f.properties.code, f.properties.centroid]));
    return { byCode, noPoly, nameByCode, centroidByCode };
  }, [freight, codeOf, geo]);

  // GeoJSON com propriedades derivadas (cor/altura/montagem) p/ o mapa.
  const styledGeo = useMemo(() => {
    if (!geo) return null;
    const feats = geo.features.map((f) => {
      const idxs = byCode.get(f.properties.code);
      const has = !!idxs?.length;
      const amount = has ? Math.min(...idxs!.map((i) => freight![i].amount)) : 0;
      const required = has && idxs!.some((i) => freight![i].assembly === "required");
      return { type: "Feature", geometry: f.geometry, properties: {
        code: f.properties.code, name: f.properties.name,
        color: has ? bandColor(amount) : NO_FREIGHT,
        height: has ? Math.max(amount * HEIGHT_SCALE, 300) : 0,
        amount, has: has ? 1 : 0, required: required ? 1 : 0,
      } };
    });
    return { type: "FeatureCollection", features: feats } as unknown as GeoJSON.FeatureCollection;
  }, [geo, byCode, freight]);

  useEffect(() => { freightRef.current = freight ?? []; }, [freight]);
  useEffect(() => { selCodeRef.current = selCode; }, [selCode]);

  // Refs vivas p/ os handlers do mapa (capturam o closure só na init).
  const byCodeRef = useRef(byCode); useEffect(() => { byCodeRef.current = byCode; }, [byCode]);
  const nameByCodeRef = useRef(nameByCode); useEffect(() => { nameByCodeRef.current = nameByCode; }, [nameByCode]);

  // ── Inicializa o mapa (uma vez, quando geo + container prontos) ───────────────
  useEffect(() => {
    if (!mapDiv.current || !styledGeo || mapRef.current) return;
    let disposed = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !mapDiv.current) return;
      const dark = document.documentElement.getAttribute("data-pt") === "dark";
      const bg = dark ? "#0e1621" : "#eaeef4";
      const map = new maplibregl.Map({
        container: mapDiv.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }] },
        center: [-53.1, -29.7], zoom: 5.6, pitch: 48, bearing: -12, minZoom: 4.2, maxZoom: 13, maxPitch: 75, attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      popRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "frete-pop" });

      map.on("load", () => {
        map.addSource("munis", { type: "geojson", data: styledGeo });
        map.addLayer({ id: "munis-3d", type: "fill-extrusion", source: "munis", paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-vertical-gradient": true,
        } });
        // Hachura de montagem obrigatória: contorno grosso pontilhado no topo.
        map.addLayer({ id: "munis-req", type: "line", source: "munis", filter: ["==", ["get", "required"], 1], paint: { "line-color": "#111", "line-width": 1.4, "line-dasharray": [1.5, 1.2], "line-opacity": 0.7 } });
        map.addLayer({ id: "munis-line", type: "line", source: "munis", paint: { "line-color": dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.16)", "line-width": 0.4 } });
        map.addLayer({ id: "munis-sel", type: "line", source: "munis", filter: ["==", ["get", "code"], ""], paint: { "line-color": dark ? "#fff" : "#111", "line-width": 2.2 } });
        setReady(true);
      });

      const describe = (code: string) => {
        const idxs = byCodeRef.current.get(code);
        const nm = nameByCodeRef.current.get(code) ?? code;
        if (!idxs?.length) return `<strong>${nm}</strong><br/><span style="opacity:.7">sem frete — clique para cadastrar</span>`;
        const lines = idxs.map((i) => { const f = freightRef.current[i]; return `${f.region}: <b>${brl(f.amount)}</b>${f.assembly === "required" ? " ⚙" : ""}`; }).join("<br/>");
        return `<strong>${nm}</strong><br/>${lines}`;
      };

      map.on("mousemove", "munis-3d", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0]; if (!f) return;
        popRef.current!.setLngLat(e.lngLat).setHTML(describe(String(f.properties!.code))).addTo(map);
      });
      map.on("mouseleave", "munis-3d", () => { map.getCanvas().style.cursor = ""; popRef.current!.remove(); });
      map.on("click", "munis-3d", (e) => { const f = e.features?.[0]; if (f) setSelCode(String(f.properties!.code)); });
    })();
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styledGeo !== null]);

  // Atualiza os dados do mapa quando o frete muda.
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !styledGeo) return;
    (map.getSource("munis") as GeoJSONSource | undefined)?.setData(styledGeo);
  }, [styledGeo, ready]);

  // Realça o município selecionado.
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    if (map.getLayer("munis-sel")) map.setFilter("munis-sel", ["==", ["get", "code"], selCode ?? ""]);
  }, [selCode, ready]);

  if (!freight) return <div style={{ padding: 40, textAlign: "center", color: "var(--p-muted)" }}>Carregando frete…</div>;

  const mutate = (next: Freight[]) => { setFreight(next); setDirty(true); };
  async function save() {
    if (!freight) return;
    setSaving(true);
    try {
      const enriched = freight.map((f) => ({ ...f, code: codeOf(f) }));
      const res = await fetch(`/api/portal/${token}/freight`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ freight: enriched }) });
      if (res.ok) { setFreight(enriched); setDirty(false); }
    } finally { setSaving(false); }
  }

  function flyTo(code: string) {
    const c = centroidByCode.get(code); const map = mapRef.current;
    if (c && map) map.easeTo({ center: c as [number, number], zoom: 9.2, pitch: 55, duration: 900 });
  }
  function resetView() { mapRef.current?.easeTo({ center: [-53.1, -29.7], zoom: 5.6, pitch: 48, bearing: -12, duration: 800 }); }

  const activeName = selCode ? (nameByCode.get(selCode) ?? selCode) : null;
  const selIdxs = selCode ? (byCode.get(selCode) ?? []) : [];
  const editAt = (i: number, patch: Partial<Freight>) => mutate(freight.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const removeAt = (i: number) => mutate(freight.filter((_, j) => j !== i));
  const addForActive = () => { if (activeName && selCode) mutate([...freight, { region: activeName, amount: 0, code: selCode, assembly: "optional" }]); };
  function doSearch(text: string) {
    setQ(text);
    if (!text.trim() || !geo) return;
    const s = normalizeName(text);
    const hit = geo.features.find((f) => f.properties.slug.includes(s));
    if (hit) { setSelCode(hit.properties.code); flyTo(hit.properties.code); }
  }

  const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, padding: 14 };
  const inp: React.CSSProperties = { padding: "6px 8px", borderRadius: 6, border: "1px solid var(--p-border)", background: "var(--p-bg)", fontSize: 12, color: "var(--p-text)" };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Truck size={18} color="var(--p-accent)" />
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: "var(--p-text)" }}>Frete por região</h1>
        <div style={{ flex: 1 }} />
        <button onClick={save} disabled={!dirty || saving}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: dirty ? "pointer" : "default", background: dirty ? "var(--p-accent)" : "var(--p-surface)", color: dirty ? "var(--p-on-accent)" : "var(--p-muted)", fontSize: 13, fontWeight: 600, border: dirty ? "none" : "1px solid var(--p-border)" }}>
          <Save size={14} /> {saving ? "Salvando…" : dirty ? "Salvar alterações" : "Salvo"}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--p-muted)", margin: "0 0 16px" }}>
        Mapa 3D navegável — a <b>altura</b> e a <b>cor</b> de cada município mostram o valor do frete. Dê zoom, gire e clique num município para editar o valor e a montagem. Municípios cinza estão <b>sem frete</b>: clique para cadastrar. É a mesma tabela que a IA usa para cotar.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20, alignItems: "start" }} className="frete-grid">
        <div style={{ position: "relative", ...card, padding: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "4px 6px 10px" }}>
            {BANDS.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-muted)" }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, display: "inline-block" }} />{b.label}
              </span>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-muted)" }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: NO_FREIGHT, display: "inline-block" }} /> sem frete
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-muted)" }}>⚙ montagem obrigatória</span>
          </div>
          <div style={{ position: "relative" }}>
            <div ref={mapDiv} style={{ width: "100%", height: 620, borderRadius: 10, overflow: "hidden" }} />
            <button onClick={resetView} title="Ver o RS inteiro" style={{ position: "absolute", left: 10, top: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--p-text)", fontSize: 12, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
              <RotateCcw size={13} /> RS inteiro
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...card, padding: "8px 10px" }}>
            <Search size={14} color="var(--p-muted)" />
            <input value={q} onChange={(e) => doSearch(e.target.value)} placeholder="Buscar município (voa até ele)…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--p-text)" }} />
          </div>

          <div style={card}>
            {!selCode ? (
              <div style={{ color: "var(--p-muted)", fontSize: 13, textAlign: "center", padding: "20px 8px" }}>
                <MapPin size={20} style={{ opacity: 0.5 }} /><br />Clique num município no mapa (ou busque) para ver e editar o frete.
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2, color: "var(--p-text)" }}>{activeName}</div>
                <div style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 10 }}>cód. IBGE {selCode} · <button onClick={() => flyTo(selCode)} style={{ border: "none", background: "transparent", color: "var(--p-accent)", cursor: "pointer", padding: 0, fontSize: 11 }}>ver no mapa</button></div>
                {selIdxs.length === 0 && <div style={{ fontSize: 13, color: "var(--p-muted)", marginBottom: 10 }}>Sem frete cadastrado aqui.</div>}
                {selIdxs.map((i) => {
                  const f = freight[i];
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", borderTop: "1px dashed var(--p-border)" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={f.region} onChange={(e) => editAt(i, { region: e.target.value })} style={{ ...inp, flex: "1 1 90px", minWidth: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--p-muted)" }}>R$</span>
                        <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })} style={{ ...inp, width: 74 }} />
                        <button onClick={() => removeAt(i)} title="Remover" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", display: "flex" }}><Trash2 size={14} /></button>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-muted)" }}>
                        <input type="checkbox" checked={f.assembly === "required"} onChange={(e) => editAt(i, { assembly: e.target.checked ? "required" : "optional" })} />
                        montagem obrigatória
                      </label>
                    </div>
                  );
                })}
                <button onClick={addForActive} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: "1px dashed var(--p-border)", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--p-text)", width: "100%", justifyContent: "center" }}>
                  <Plus size={13} /> {selIdxs.length ? "Adicionar zona" : "Adicionar frete aqui"}
                </button>
              </>
            )}
          </div>

          {noPoly.length > 0 && (
            <div style={card}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--p-text)" }}>Sem município no mapa <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>({noPoly.length})</span></div>
              <div style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 10 }}>Distritos/regiões que não são município (ex.: Ilha das Flores). A IA cota normal; só não aparecem no mapa.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                {noPoly.map((i) => {
                  const f = freight[i];
                  return (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ flex: 1, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--p-text)" }}>{f.region}{f.assembly === "required" ? " ⚙" : ""}</span>
                      <span style={{ fontSize: 12, color: "var(--p-muted)" }}>R$</span>
                      <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })} style={{ ...inp, width: 70 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--p-muted)" }}>
            {freight.length} regiões cadastradas · {byCode.size} municípios no mapa
          </div>
        </div>
      </div>
      <style>{`@media(max-width:820px){ .frete-grid{grid-template-columns:1fr !important} }
        .frete-pop .maplibregl-popup-content{background:var(--p-surface);color:var(--p-text);border:1px solid var(--p-border);border-radius:8px;font-size:12px;padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,.2)}
        .frete-pop .maplibregl-popup-tip{border-top-color:var(--p-surface);border-bottom-color:var(--p-surface)}`}</style>
    </div>
  );
}
