"use client";

// Seção "Frete" do portal do cliente. Ferramenta de cadastro de frete por REGIÃO/ZONA.
// - Mapa 3D (MapLibre, sem tiles externos) = visão geral: cada município extrudado pela
//   faixa de preço; clique seleciona a cidade.
// - Editor por CIDADE → ZONAS → BAIRROS: cada cidade pode ter várias zonas (Central, Zona
//   Sul, Extremo Sul, Rural...), cada uma com valor, montagem e os BAIRROS que a
//   identificam (auto-detecção da IA). Grava o rules.freight — a mesma tabela que a IA usa
//   pra cotar (cidade→zona, resolvida pelo bairro; se não reconhecer, a IA pergunta).
import { useEffect, useMemo, useRef, useState } from "react";
import { Truck, Save, Plus, Trash2, MapPin, Search, RotateCcw, X, Upload } from "lucide-react";
import { parseFreightTable, buildImportPreview, type ImportRow } from "@/lib/freight-import";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, GeoJSONSource, Popup as MlPopup, Marker as MlMarker } from "maplibre-gl";
type Maplibre = typeof import("maplibre-gl");

type Neighborhood = { name: string; lat?: number; lng?: number };
type Freight = { region: string; amount: number; city?: string; zone?: string; aliases?: string[]; neighborhoods?: Neighborhood[]; code?: string | null; assembly?: "optional" | "required" };
// Cores distintas por zona (pin + legenda) — só pra diferenciar zonas da MESMA cidade.
const ZONE_PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777"];
type GeoFeature = { properties: { code: string; name: string; slug: string; centroid: [number, number] }; geometry: { type: string; coordinates: unknown } };
type Geo = { type: "FeatureCollection"; features: GeoFeature[] };

const BANDS = [
  { max: 150, color: "#16a34a", label: "≤ R$150" },
  { max: 300, color: "#eab308", label: "R$150–300" },
  { max: 450, color: "#f97316", label: "R$300–450" },
  { max: Infinity, color: "#dc2626", label: "R$450+" },
];
const NO_FREIGHT = "#c7ccd4";
const bandColor = (a: number) => BANDS.find((b) => a <= b.max)?.color ?? "#9ca3af";
const HEIGHT_SCALE = 22;
const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
const normalizeName = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, " ");

const NAME_FIXES: Record<string, string> = { "sapucaia": "sapucaia do sul" };
const ZONE_SUFFIXES: RegExp[] = [/\s+extremo\s+sul$/i, /\s+zona\s+rural$/i, /\s+rural$/i, /\s+zona\s+sul$/i, /\s+zs$/i, /\s+zr$/i, /\s+zl$/i, /\s+ze$/i, /\s+zn$/i];
function citySlugOf(region: string): string {
  let city = region.trim();
  for (const re of ZONE_SUFFIXES) if (re.test(city)) { city = city.replace(re, "").trim(); break; }
  const slug = normalizeName(city);
  return NAME_FIXES[slug] ?? slug;
}
// Rótulo da zona a partir do region (quando não há campo zone salvo): "Porto Alegre ZS" → "ZS".
function deriveZone(region: string, cityName: string): string {
  const r = region.trim();
  const c = cityName.trim();
  if (c && r.toLowerCase().startsWith(c.toLowerCase())) return r.slice(c.length).replace(/^[\s—–-]+/, "").trim();
  for (const re of ZONE_SUFFIXES) { const m = r.match(re); if (m) return m[0].trim(); }
  return "";
}

type GeoProj = { paths: { code: string; name: string; slug: string }[]; codeBySlug: Map<string, string>; nameByCode: Map<string, string>; centroidByCode: Map<string, [number, number]> };

export function PortalFrete({ token }: { token: string }) {
  const [freight, setFreight] = useState<Freight[] | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [selCode, setSelCode] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [ready, setReady] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popRef = useRef<MlPopup | null>(null);
  const mlRef = useRef<Maplibre | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
  const freightRef = useRef<Freight[]>([]);

  // Geocodifica um bairro (server-side, Nominatim) → {lat,lng} | null.
  const geocode = async (name: string, city: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const r = await fetch(`/api/portal/${token}/geocode?q=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}`, { cache: "no-store" });
      const d = await r.json();
      return d?.found ? { lat: d.lat, lng: d.lng } : null;
    } catch { return null; }
  };

  useEffect(() => {
    fetch(`/api/portal/${token}/freight`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      setFreight(Array.isArray(d?.freight) ? d.freight.map((f: Freight) => ({ ...f })) : []);
    }).catch(() => setFreight([]));
    fetch("/geo/rs-municipios.geojson").then((r) => r.json()).then(setGeo).catch(() => {});
  }, [token]);

  const meta: GeoProj | null = useMemo(() => {
    if (!geo) return null;
    return {
      paths: geo.features.map((f) => ({ code: f.properties.code, name: f.properties.name, slug: f.properties.slug })),
      codeBySlug: new Map(geo.features.map((f) => [f.properties.slug, f.properties.code])),
      nameByCode: new Map(geo.features.map((f) => [f.properties.code, f.properties.name])),
      centroidByCode: new Map(geo.features.map((f) => [f.properties.code, f.properties.centroid])),
    };
  }, [geo]);

  const codeOf = useMemo(() => {
    const idx = meta?.codeBySlug;
    return (f: Freight): string | null => f.code ?? (idx ? (idx.get(citySlugOf(f.city || f.region)) ?? null) : null);
  }, [meta]);

  const { byCode, noPoly } = useMemo(() => {
    const byCode = new Map<string, number[]>();
    const noPoly: number[] = [];
    (freight ?? []).forEach((f, i) => { const c = codeOf(f); if (c) { const a = byCode.get(c) ?? []; a.push(i); byCode.set(c, a); } else noPoly.push(i); });
    return { byCode, noPoly };
  }, [freight, codeOf]);

  // GeoJSON estilizado p/ o mapa (cor/altura pela MENOR faixa da cidade).
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
        required: required ? 1 : 0,
      } };
    });
    return { type: "FeatureCollection", features: feats } as unknown as GeoJSON.FeatureCollection;
  }, [geo, byCode, freight]);

  useEffect(() => { freightRef.current = freight ?? []; }, [freight]);
  const byCodeRef = useRef(byCode); useEffect(() => { byCodeRef.current = byCode; }, [byCode]);
  const nameByCodeRef = useRef(meta?.nameByCode); useEffect(() => { nameByCodeRef.current = meta?.nameByCode; }, [meta]);

  // ── Mapa (init único) ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDiv.current || !styledGeo || mapRef.current) return;
    let disposed = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      mlRef.current = maplibregl as unknown as Maplibre;
      if (disposed || !mapDiv.current) return;
      const dark = document.documentElement.getAttribute("data-pt") === "dark";
      const map = new maplibregl.Map({
        container: mapDiv.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": dark ? "#0e1621" : "#eaeef4" } }] },
        center: [-53.1, -29.7], zoom: 5.6, pitch: 48, bearing: -12, minZoom: 4.2, maxZoom: 13, maxPitch: 75, attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      popRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "frete-pop" });
      map.on("load", () => {
        map.addSource("munis", { type: "geojson", data: styledGeo });
        map.addLayer({ id: "munis-3d", type: "fill-extrusion", source: "munis", paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.92, "fill-extrusion-vertical-gradient": true } });
        map.addLayer({ id: "munis-req", type: "line", source: "munis", filter: ["==", ["get", "required"], 1], paint: { "line-color": "#111", "line-width": 1.4, "line-dasharray": [1.5, 1.2], "line-opacity": 0.7 } });
        map.addLayer({ id: "munis-line", type: "line", source: "munis", paint: { "line-color": dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.16)", "line-width": 0.4 } });
        map.addLayer({ id: "munis-sel", type: "line", source: "munis", filter: ["==", ["get", "code"], ""], paint: { "line-color": dark ? "#fff" : "#111", "line-width": 2.2 } });
        setReady(true);
      });
      const describe = (code: string) => {
        const idxs = byCodeRef.current.get(code);
        const nm = nameByCodeRef.current?.get(code) ?? code;
        if (!idxs?.length) return `<strong>${nm}</strong><br/><span style="opacity:.7">sem frete — clique para cadastrar</span>`;
        const lines = idxs.map((i) => { const f = freightRef.current[i]; const z = f.zone || deriveZone(f.region, nm) || "cidade"; return `${z}: <b>${brl(f.amount)}</b>${f.assembly === "required" ? " ⚙" : ""}`; }).join("<br/>");
        return `<strong>${nm}</strong><br/>${lines}`;
      };
      map.on("mousemove", "munis-3d", (e) => { map.getCanvas().style.cursor = "pointer"; const f = e.features?.[0]; if (f) popRef.current!.setLngLat(e.lngLat).setHTML(describe(String(f.properties!.code))).addTo(map); });
      map.on("mouseleave", "munis-3d", () => { map.getCanvas().style.cursor = ""; popRef.current!.remove(); });
      map.on("click", "munis-3d", (e) => { const f = e.features?.[0]; if (f) setSelCode(String(f.properties!.code)); });
    })();
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styledGeo !== null]);

  useEffect(() => { const map = mapRef.current; if (map && ready && styledGeo) (map.getSource("munis") as GeoJSONSource | undefined)?.setData(styledGeo); }, [styledGeo, ready]);
  useEffect(() => { const map = mapRef.current; if (map && ready && map.getLayer("munis-sel")) map.setFilter("munis-sel", ["==", ["get", "code"], selCode ?? ""]); }, [selCode, ready]);

  // Ao selecionar cidade com VÁRIAS zonas, aproxima pra ver os pins dos bairros.
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !selCode) return;
    const idxs = byCode.get(selCode) ?? []; const c = meta?.centroidByCode.get(selCode);
    if (idxs.length > 1 && c) map.easeTo({ center: c, zoom: 10.2, pitch: 55, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCode, ready]);

  // Pins arrastáveis dos bairros da cidade selecionada (só multi-zona), coloridos por zona.
  const updateNb = (fi: number, ni: number, patch: Partial<Neighborhood>) =>
    setFreight((prev) => { if (!prev) return prev; const next = [...prev]; const nbs = [...(next[fi].neighborhoods ?? [])]; nbs[ni] = { ...nbs[ni], ...patch }; next[fi] = { ...next[fi], neighborhoods: nbs }; return next; });
  useEffect(() => {
    const map = mapRef.current, ml = mlRef.current; if (!map || !ml || !ready) return;
    markersRef.current.forEach((m) => m.remove()); markersRef.current = [];
    if (!selCode || !freight) return;
    const idxs = byCode.get(selCode) ?? []; if (idxs.length < 2) return;
    const c = meta?.centroidByCode.get(selCode);
    idxs.forEach((fi, zi) => {
      const color = ZONE_PALETTE[zi % ZONE_PALETTE.length];
      (freight[fi].neighborhoods ?? []).forEach((nb, ni) => {
        const lng = nb.lng ?? c?.[0], lat = nb.lat ?? c?.[1];
        if (lng == null || lat == null) return;
        const located = nb.lat != null && nb.lng != null;
        const el = document.createElement("div");
        el.style.cssText = `width:15px;height:15px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);cursor:grab;${located ? "" : "opacity:.55;"}`;
        el.title = `${nb.name}${located ? "" : " (sem localização — arraste)"}`;
        const marker = new ml.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(map);
        marker.on("dragend", () => { const p = marker.getLngLat(); updateNb(fi, ni, { lat: p.lat, lng: p.lng }); setDirty(true); });
        markersRef.current.push(marker);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCode, freight, ready, byCode]);

  if (!freight) return <div style={{ padding: 40, textAlign: "center", color: "var(--p-muted)" }}>Carregando frete…</div>;

  const mutate = (next: Freight[]) => { setFreight(next); setDirty(true); };
  async function save() {
    if (!freight || !meta) return;
    setSaving(true);
    try {
      // Cimenta code + city (IBGE) e recompõe region = "Cidade — Zona" (consistência p/ a IA).
      const enriched = freight.map((f) => {
        const code = codeOf(f);
        const city = f.city || (code ? meta.nameByCode.get(code) : undefined) || f.region;
        const zone = (f.zone || "").trim();
        const region = zone ? `${city} — ${zone}` : city;
        return { ...f, code, city, zone: zone || undefined, region, aliases: (f.aliases || []).map((s) => s.trim()).filter(Boolean), neighborhoods: (f.neighborhoods || []).filter((n) => n.name?.trim()) };
      });
      const res = await fetch(`/api/portal/${token}/freight`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ freight: enriched }) });
      if (res.ok) { setFreight(enriched); setDirty(false); }
    } finally { setSaving(false); }
  }

  const cityName = selCode ? (meta?.nameByCode.get(selCode) ?? selCode) : null;
  const selIdxs = selCode ? (byCode.get(selCode) ?? []) : [];
  const editAt = (i: number, patch: Partial<Freight>) => mutate(freight.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const removeAt = (i: number) => mutate(freight.filter((_, j) => j !== i));
  const addZone = () => { if (selCode && cityName) mutate([...freight, { region: cityName, city: cityName, code: selCode, zone: selIdxs.length ? "" : "Central", amount: 0, assembly: "optional", aliases: [] }]); };

  function flyTo(code: string) { const c = meta?.centroidByCode.get(code); if (c) mapRef.current?.easeTo({ center: c, zoom: 9.2, pitch: 55, duration: 900 }); }
  function resetView() { mapRef.current?.easeTo({ center: [-53.1, -29.7], zoom: 5.6, pitch: 48, bearing: -12, duration: 800 }); }
  function doSearch(text: string) {
    setQ(text);
    if (!text.trim() || !meta) return;
    const s = normalizeName(text);
    const hit = meta.paths.find((p) => p.slug.includes(s));
    if (hit) { setSelCode(hit.code); flyTo(hit.code); }
  }

  const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, padding: 14 };
  const inp: React.CSSProperties = { padding: "6px 8px", borderRadius: 6, border: "1px solid var(--p-border)", background: "var(--p-bg)", fontSize: 12, color: "var(--p-text)" };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Truck size={18} color="var(--p-accent)" />
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: "var(--p-text)" }}>Frete por região</h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => setImportOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: "var(--p-surface)", color: "var(--p-text)", fontSize: 13, fontWeight: 600, border: "1px solid var(--p-border)" }}>
          <Upload size={14} /> Importar planilha
        </button>
        <button onClick={save} disabled={!dirty || saving}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: dirty ? "pointer" : "default", background: dirty ? "var(--p-accent)" : "var(--p-surface)", color: dirty ? "var(--p-on-accent)" : "var(--p-muted)", fontSize: 13, fontWeight: 600, border: dirty ? "none" : "1px solid var(--p-border)" }}>
          <Save size={14} /> {saving ? "Salvando…" : dirty ? "Salvar alterações" : "Salvo"}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--p-muted)", margin: "0 0 16px" }}>
        Clique num município no mapa para gerenciar as <b>zonas</b> dele (Central, Zona Sul, Rural…). Em cada zona, informe o valor, se exige montagem e os <b>bairros</b> que a identificam — a IA usa os bairros pra reconhecer a zona do cliente sozinha; quando não reconhece, ela pergunta.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 20, alignItems: "start" }} className="frete-grid">
        <div style={{ position: "relative", ...card, padding: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "4px 6px 10px" }}>
            {BANDS.map((b, i) => (<span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-muted)" }}><span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, display: "inline-block" }} />{b.label}</span>))}
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-muted)" }}><span style={{ width: 14, height: 14, borderRadius: 3, background: NO_FREIGHT, display: "inline-block" }} /> sem frete</span>
            <span style={{ fontSize: 12, color: "var(--p-muted)" }}>⚙ montagem obrigatória</span>
          </div>
          <div style={{ position: "relative" }}>
            <div ref={mapDiv} style={{ width: "100%", height: 600, borderRadius: 10, overflow: "hidden" }} />
            <button onClick={resetView} title="Ver o RS inteiro" style={{ position: "absolute", left: 10, top: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--p-text)", fontSize: 12, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}><RotateCcw size={13} /> RS inteiro</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...card, padding: "8px 10px" }}>
            <Search size={14} color="var(--p-muted)" />
            <input value={q} onChange={(e) => doSearch(e.target.value)} placeholder="Buscar município (voa até ele)…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--p-text)" }} />
          </div>

          <div style={card}>
            {!selCode ? (
              <div style={{ color: "var(--p-muted)", fontSize: 13, textAlign: "center", padding: "24px 8px" }}>
                <MapPin size={20} style={{ opacity: 0.5 }} /><br />Clique num município no mapa (ou busque) para gerenciar as zonas de frete.
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--p-text)" }}>{cityName}</div>
                <div style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 10 }}>cód. IBGE {selCode} · {selIdxs.length} {selIdxs.length === 1 ? "zona" : "zonas"} · <button onClick={() => flyTo(selCode)} style={{ border: "none", background: "transparent", color: "var(--p-accent)", cursor: "pointer", padding: 0, fontSize: 11 }}>ver no mapa</button></div>
                {selIdxs.length === 0 && <div style={{ fontSize: 13, color: "var(--p-muted)", marginBottom: 10 }}>Sem frete cadastrado aqui ainda.</div>}
                {selIdxs.length > 1 && <div style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 4 }}>Cada zona tem sua cor no mapa. Cadastre os bairros de cada uma para a IA reconhecer a zona do cliente.</div>}
                {selIdxs.map((i, zi) => {
                  const f = freight[i];
                  const multi = selIdxs.length > 1;
                  const swatch = multi ? ZONE_PALETTE[zi % ZONE_PALETTE.length] : bandColor(f.amount);
                  return (
                    <div key={i} style={{ borderTop: "1px dashed var(--p-border)", padding: "10px 0" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ width: 12, height: 12, borderRadius: multi ? "50% 50% 50% 0" : 3, transform: multi ? "rotate(-45deg)" : "none", background: swatch, flexShrink: 0 }} />
                        <input value={f.zone ?? deriveZone(f.region, cityName!)} onChange={(e) => editAt(i, { zone: e.target.value })} placeholder="zona (ex: Central, Zona Sul)" style={{ ...inp, flex: "1 1 100px", minWidth: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--p-muted)" }}>R$</span>
                        <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })} style={{ ...inp, width: 70 }} />
                        <button onClick={() => removeAt(i)} title="Remover zona" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", display: "flex" }}><Trash2 size={14} /></button>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-muted)", marginBottom: multi ? 8 : 0 }}>
                        <input type="checkbox" checked={f.assembly === "required"} onChange={(e) => editAt(i, { assembly: e.target.checked ? "required" : "optional" })} /> montagem obrigatória
                      </label>
                      {multi && <Neighborhoods value={f.neighborhoods ?? []} onChange={(v) => editAt(i, { neighborhoods: v })} inp={inp} color={swatch} geocode={(n) => geocode(n, cityName!)} onFly={(nb) => { if (nb.lng != null && nb.lat != null) mapRef.current?.easeTo({ center: [nb.lng, nb.lat], zoom: 12.5, duration: 700 }); }} />}
                    </div>
                  );
                })}
                <button onClick={addZone} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8, border: "1px dashed var(--p-border)", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--p-text)", width: "100%", justifyContent: "center" }}>
                  <Plus size={13} /> Adicionar zona
                </button>
              </>
            )}
          </div>

          {noPoly.length > 0 && (
            <div style={card}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--p-text)" }}>Sem município no mapa <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>({noPoly.length})</span></div>
              <div style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 10 }}>Distritos/regiões que não são município (ex.: Ilha das Flores). A IA cota normal; só não aparecem no mapa.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {noPoly.map((i) => { const f = freight[i]; return (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ flex: 1, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--p-text)" }}>{f.region}{f.assembly === "required" ? " ⚙" : ""}</span>
                    <span style={{ fontSize: 12, color: "var(--p-muted)" }}>R$</span>
                    <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })} style={{ ...inp, width: 70 }} />
                  </div>); })}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--p-muted)" }}>{freight.length} zonas cadastradas · {byCode.size} municípios no mapa</div>
        </div>
      </div>
      <style>{`@media(max-width:860px){ .frete-grid{grid-template-columns:1fr !important} }
        .frete-pop .maplibregl-popup-content{background:var(--p-surface);color:var(--p-text);border:1px solid var(--p-border);border-radius:8px;font-size:12px;padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,.2)}
        .frete-pop .maplibregl-popup-tip{border-top-color:var(--p-surface);border-bottom-color:var(--p-surface)}`}</style>

      {importOpen && meta && (
        <ImportModal existing={freight} geo={meta} onClose={() => setImportOpen(false)}
          onApply={(merged) => { setFreight(merged); setDirty(true); setImportOpen(false); setSelCode(null); }} />
      )}
    </div>
  );
}

// Modal de importação de planilha — cola o texto, PREVIEW obrigatório (nada grava sem
// confirmar), aplica mesclando (preserva bairros). "Sem erros" = você revisa antes.
const STATUS_META: Record<ImportRow["status"], { label: string; color: string }> = {
  price: { label: "preço muda", color: "#ea580c" },
  new: { label: "novo", color: "#16a34a" },
  same: { label: "igual", color: "#64748b" },
  unmatched: { label: "não reconhecido", color: "#dc2626" },
};
function ImportModal({ existing, geo, onClose, onApply }: {
  existing: import("@/lib/ai-agent/pricing").FreightRegion[];
  geo: GeoProj; onClose: () => void; onApply: (merged: import("@/lib/ai-agent/pricing").FreightRegion[]) => void;
}) {
  const [text, setText] = useState("");
  const [res, setRes] = useState<{ rows: ImportRow[]; merged: import("@/lib/ai-agent/pricing").FreightRegion[]; skipped: string[] } | null>(null);
  function analyze() {
    const { rows: parsed, skipped } = parseFreightTable(text);
    const { rows, merged } = buildImportPreview(existing, parsed, { codeBySlug: geo.codeBySlug, nameByCode: geo.nameByCode });
    setRes({ rows, merged, skipped });
  }
  const changes = res ? res.rows.filter((r) => r.status === "new" || r.status === "price").length : 0;
  const box: React.CSSProperties = { background: "var(--p-surface)", color: "var(--p-text)", border: "1px solid var(--p-border)", borderRadius: 12 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...box, width: "min(760px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Upload size={17} color="var(--p-accent)" />
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Importar planilha de frete</h2>
          <div style={{ flex: 1 }} /><X size={18} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <p style={{ fontSize: 12, color: "var(--p-muted)", margin: "0 0 10px" }}>
          Cole a tabela (uma região por linha, com o preço). Ex.: <i>Frete Canoas&nbsp;&nbsp;R$ 60,00</i>. Você vê o que vai mudar <b>antes</b> de aplicar — os bairros já cadastrados são preservados.
        </p>
        {!res ? (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"Frete Canoas\tR$ 60,00\nFrete Porto Alegre ZS\tR$ 250,00\n…"}
              style={{ ...box, flex: 1, minHeight: 220, padding: 10, fontSize: 12, fontFamily: "monospace", resize: "vertical", background: "var(--p-bg)" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-text)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={analyze} disabled={!text.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", cursor: text.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>Analisar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "var(--p-muted)", marginBottom: 8 }}>
              {res.rows.filter((r) => r.status === "new").length} novos · {res.rows.filter((r) => r.status === "price").length} com preço alterado · {res.rows.filter((r) => r.status === "same").length} iguais · {res.rows.filter((r) => r.status === "unmatched").length} não reconhecidos{res.skipped.length ? ` · ${res.skipped.length} linhas ignoradas` : ""}
            </div>
            <div style={{ ...box, flex: 1, overflowY: "auto", padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ position: "sticky", top: 0, background: "var(--p-surface)" }}>
                  <th style={{ textAlign: "left", padding: "7px 10px", color: "var(--p-muted)", fontWeight: 600 }}>Região</th>
                  <th style={{ textAlign: "right", padding: "7px 10px", color: "var(--p-muted)", fontWeight: 600 }}>Preço</th>
                  <th style={{ textAlign: "left", padding: "7px 10px", color: "var(--p-muted)", fontWeight: 600 }}>Situação</th>
                </tr></thead>
                <tbody>
                  {res.rows.map((r, i) => { const m = STATUS_META[r.status]; return (
                    <tr key={i} style={{ borderTop: "1px solid var(--p-border)", opacity: r.status === "same" ? 0.55 : 1 }}>
                      <td style={{ padding: "6px 10px" }}>{r.region}{r.status === "unmatched" && <span title="não achei esse município no IBGE — confira o nome" style={{ color: "#dc2626" }}> ⚠</span>}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{r.status === "price" ? <span><span style={{ color: "var(--p-muted)", textDecoration: "line-through" }}>{brl(r.from!)}</span> → <b>{brl(r.amount)}</b></span> : brl(r.amount)}</td>
                      <td style={{ padding: "6px 10px" }}><span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.label}</span></td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <button onClick={() => setRes(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-text)", cursor: "pointer", fontSize: 13 }}>← Voltar</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: "var(--p-muted)" }}>Aplicar não salva sozinho — revise e clique em Salvar depois.</span>
              <button onClick={() => onApply(res.merged)} disabled={!changes} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: changes ? "var(--p-accent)" : "var(--p-surface)", color: changes ? "var(--p-on-accent)" : "var(--p-muted)", cursor: changes ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>Aplicar {changes} alteraç{changes === 1 ? "ão" : "ões"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Editor de BAIRROS de uma zona — geocodifica ao adicionar (pin no mapa) e a IA
// reconhece a zona do cliente por eles. Bairro sem localização vira pin translúcido
// no centro da cidade, pra você arrastar até o lugar.
function Neighborhoods({ value, onChange, inp, color, geocode, onFly }: {
  value: Neighborhood[]; onChange: (v: Neighborhood[]) => void; inp: React.CSSProperties; color: string;
  geocode: (name: string) => Promise<{ lat: number; lng: number } | null>; onFly: (nb: Neighborhood) => void;
}) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    const parts = t.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setBusy(true); setT("");
    const added: Neighborhood[] = [];
    for (const name of parts) {
      if (value.some((v) => normalizeName(v.name) === normalizeName(name))) continue;
      const g = await geocode(name);
      added.push({ name, ...(g ?? {}) });
    }
    if (added.length) onChange([...value, ...added]);
    setBusy(false);
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 4 }}>Bairros desta zona <span style={{ opacity: 0.7 }}>(a IA reconhece o cliente por eles; viram pin no mapa)</span></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {value.map((b, k) => {
          const located = b.lat != null && b.lng != null;
          return (
            <span key={k} title={located ? "clique p/ ver no mapa" : "sem localização — arraste o pin no mapa"} onClick={() => located && onFly(b)}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "var(--p-accent-soft)", color: "var(--p-text)", cursor: located ? "pointer" : "default", opacity: located ? 1 : 0.7 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: located ? color : "var(--p-muted)" }} />
              {b.name}<X size={11} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, j) => j !== k)); }} />
            </span>
          );
        })}
        {!value.length && <span style={{ fontSize: 11, color: "var(--p-muted)", opacity: 0.7 }}>nenhum ainda</span>}
        {busy && <span style={{ fontSize: 11, color: "var(--p-muted)" }}>localizando…</span>}
      </div>
      <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add}
        placeholder="digite um bairro e Enter (ou vários por vírgula)" style={{ ...inp, width: "100%" }} />
    </div>
  );
}
