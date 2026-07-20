"use client";

// Seção "Frete" do portal — cadastro por CAMPOS (sem mapa), organizado pro dia a dia.
// Lista por CIDADE → ZONAS → BAIRROS: busca, cadastro por autocomplete de município,
// zonas com valor/montagem e os bairros que a IA usa pra reconhecer a zona do cliente.
// Grava o rules.freight — a mesma tabela que a IA usa pra cotar.
import { useEffect, useMemo, useState } from "react";
import { Truck, Save, Plus, Trash2, Search, Upload, ChevronRight, X, AlertTriangle, Layers } from "lucide-react";
import { parseFreightTable, buildImportPreview, type ImportRow } from "@/lib/freight-import";
import { lintFreight } from "@/lib/ai-agent/freight-lint";

type Neighborhood = { name: string; lat?: number; lng?: number };
type Freight = { region: string; amount: number; city?: string; zone?: string; aliases?: string[]; neighborhoods?: Neighborhood[]; code?: string | null; assembly?: "optional" | "required" };
type Muni = { code: string; name: string; slug: string };

const BANDS = [{ max: 150, color: "#16a34a" }, { max: 300, color: "#eab308" }, { max: 450, color: "#f97316" }, { max: Infinity, color: "#dc2626" }];
const bandColor = (a: number) => (a > 0 ? BANDS.find((b) => a <= b.max)?.color ?? "#9ca3af" : "#c7ccd4");
const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
const norm = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, " ");
const NAME_FIXES: Record<string, string> = { "sapucaia": "sapucaia do sul" };
const ZONE_SUFFIXES: RegExp[] = [/\s+extremo\s+sul$/i, /\s+zona\s+rural$/i, /\s+rural$/i, /\s+zona\s+sul$/i, /\s+zs$/i, /\s+zr$/i, /\s+zl$/i, /\s+ze$/i, /\s+zn$/i];
function citySlugOf(region: string): string {
  let c = region.trim();
  for (const re of ZONE_SUFFIXES) if (re.test(c)) { c = c.replace(re, "").trim(); break; }
  const s = norm(c); return NAME_FIXES[s] ?? s;
}
function deriveZone(f: Freight, cityName: string): string {
  if (f.zone != null) return f.zone;
  const r = f.region.trim();
  if (cityName && r.toLowerCase().startsWith(cityName.toLowerCase())) return r.slice(cityName.length).replace(/^[\s—–-]+/, "").trim();
  for (const re of ZONE_SUFFIXES) { const m = r.match(re); if (m) return m[0].trim(); }
  return "";
}
const ZONE_PRESETS = ["Central", "Zona Sul", "Zona Norte", "Zona Leste", "Zona Oeste", "Rural", "Extremo Sul"];

export function PortalFrete({ token }: { token: string }) {
  const [freight, setFreight] = useState<Freight[] | null>(null);
  const [munis, setMunis] = useState<Muni[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [flash, setFlash] = useState<string | null>(null); // cidade recém-promovida → rola + destaca

  useEffect(() => {
    fetch(`/api/portal/${token}/freight`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setFreight(Array.isArray(d?.freight) ? d.freight.map((f: Freight) => ({ ...f })) : [])).catch(() => setFreight([]));
    fetch("/geo/rs-municipios-list.json").then((r) => r.json()).then(setMunis).catch(() => {});
  }, [token]);

  // Ao promover uma cidade (tabela → editor rico) ela "sobe" pra outra seção: rola até
  // ela e destaca por ~1,4s pra deixar claro que é a mesma cidade que se moveu.
  useEffect(() => {
    if (!flash) return;
    const el = document.getElementById(`city-${flash}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [flash]);

  const { codeBySlug, nameByCode } = useMemo(() => ({
    codeBySlug: new Map(munis.map((m) => [m.slug, m.code])),
    nameByCode: new Map(munis.map((m) => [m.code, m.name])),
  }), [munis]);
  const codeOf = (f: Freight): string | null => f.code ?? (codeBySlug.get(NAME_FIXES[citySlugOf(f.city || f.region)] ?? citySlugOf(f.city || f.region)) ?? null);
  const cityKeyOf = (f: Freight) => codeOf(f) || citySlugOf(f.city || f.region);
  const cityNameOf = (f: Freight) => f.city || (codeOf(f) ? nameByCode.get(codeOf(f)!) : null) || f.region.replace(/\s+—.*$/, "");

  // Agrupa por cidade (ordenado alfabeticamente).
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; code: string | null; idxs: number[] }>();
    (freight ?? []).forEach((f, i) => {
      const key = cityKeyOf(f);
      const g = map.get(key) ?? { key, name: cityNameOf(f), code: codeOf(f), idxs: [] };
      g.idxs.push(i); map.set(key, g);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freight, munis]);

  const filtered = useMemo(() => {
    const s = norm(q); if (!s) return groups;
    return groups.filter((g) => norm(g.name).includes(s) || g.idxs.some((i) => norm(freight![i].region).includes(s) || (freight![i].neighborhoods ?? []).some((n) => norm(n.name).includes(s)) || (freight![i].aliases ?? []).some((a) => norm(a).includes(s))));
  }, [groups, q, freight]);

  const addSuggestions = useMemo(() => {
    const s = norm(addQ); if (s.length < 2) return [];
    const have = new Set(groups.map((g) => g.code).filter(Boolean));
    return munis.filter((m) => m.slug.includes(s) && !have.has(m.code)).slice(0, 6);
  }, [addQ, munis, groups]);

  // Avisos do validador de acurácia, mapeados por cidade (⚠ inline) — a aba se auto-audita.
  const { lintByCity, lintGeneral } = useMemo(() => {
    const byCity = new Map<string, string[]>(); const general: string[] = [];
    for (const iss of lintFreight((freight ?? []) as never)) {
      const idx = iss.region ? (freight ?? []).findIndex((f) => f.region === iss.region) : -1;
      if (idx < 0) { general.push(iss.message); continue; }
      const k = cityKeyOf(freight![idx]);
      (byCity.get(k) ?? byCity.set(k, []).get(k)!).push(iss.message);
    }
    return { lintByCity: byCity, lintGeneral: general };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freight, munis]);
  const lintTotal = [...lintByCity.values()].reduce((s, a) => s + a.length, 0) + lintGeneral.length;

  if (!freight) return <div style={{ padding: 40, textAlign: "center", color: "var(--p-muted)" }}>Carregando frete…</div>;

  // Cidade "complexa" (editor rico) = tem >1 zona, ou uma zona nomeada, ou bairros.
  // Senão é "simples" (só cidade + valor) → vai pra tabela compacta. Classificação
  // DERIVADA (não é um modo): ganhar zona/bairro promove; perder rebaixa, sozinho.
  const isComplex = (g: { name: string; idxs: number[] }) =>
    g.idxs.length > 1 || g.idxs.some((i) => !!deriveZone(freight![i], g.name) || (freight![i].neighborhoods?.length ?? 0) > 0);

  const mutate = (next: Freight[]) => { setFreight(next); setDirty(true); };
  const editAt = (i: number, patch: Partial<Freight>) => mutate(freight!.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const removeAt = (i: number) => mutate(freight!.filter((_, j) => j !== i));
  const addZone = (name: string, code: string | null) => mutate([...freight!, { region: name, city: name, code, zone: freight!.some((f) => cityKeyOf(f) === (code || citySlugOf(name))) ? "" : "Central", amount: 0, assembly: "optional", neighborhoods: [] }]);
  const removeCity = (idxs: number[]) => { const set = new Set(idxs); mutate(freight!.filter((_, j) => !set.has(j))); };
  function addCity(m: Muni) {
    mutate([...freight!, { region: m.name, city: m.name, code: m.code, zone: "", amount: 0, assembly: "optional", neighborhoods: [] }]);
    setExpanded((e) => new Set(e).add(m.code)); setAddQ("");
  }
  const toggle = (k: string) => setExpanded((e) => { const n = new Set(e); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Promove uma cidade simples (linha da tabela) para cidade-com-zonas: dá um rótulo à
  // zona atual ("Central") e cria uma 2ª zona vazia. Ela migra sozinha p/ a seção rica.
  function promoteCity(g: { key: string; name: string; code: string | null; idxs: number[] }) {
    const first = g.idxs[0];
    const next = freight!.map((f, j) => (j === first && !deriveZone(f, g.name) ? { ...f, zone: "Central" } : f));
    next.push({ region: g.name, city: g.name, code: g.code, zone: "", amount: 0, assembly: "optional", neighborhoods: [] });
    mutate(next);
    setExpanded((e) => new Set(e).add(g.key));
    setFlash(g.key);
  }

  async function save() {
    if (!freight) return;
    setSaving(true);
    try {
      const enriched = freight!.map((f) => {
        const code = codeOf(f);
        const city = f.city || (code ? nameByCode.get(code) : undefined) || f.region;
        const zone = (f.zone || "").trim();
        return { ...f, code, city, zone: zone || undefined, region: zone ? `${city} — ${zone}` : city, neighborhoods: (f.neighborhoods || []).filter((n) => n.name?.trim()) };
      });
      const res = await fetch(`/api/portal/${token}/freight`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ freight: enriched }) });
      if (res.ok) { setFreight(enriched); setDirty(false); }
    } finally { setSaving(false); }
  }

  const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 10, overflow: "hidden" };
  const inp: React.CSSProperties = { padding: "7px 9px", borderRadius: 7, border: "1px solid var(--p-border)", background: "var(--p-bg)", fontSize: 13, color: "var(--p-text)" };
  const zonesCount = groups.reduce((s, g) => s + g.idxs.length, 0);
  const complexGroups = filtered.filter(isComplex);
  const simpleGroups = filtered.filter((g) => !isComplex(g));
  const flashCard = (k: string): React.CSSProperties => flash === k ? { outline: "2px solid var(--p-accent)", outlineOffset: 1, boxShadow: "0 0 0 4px color-mix(in srgb, var(--p-accent) 22%, transparent)", transition: "box-shadow .3s" } : {};

  // Card da cidade COM zonas (editor rico) — usado na 1ª seção.
  const renderComplexCard = (g: { key: string; name: string; code: string | null; idxs: number[] }) => {
    const open = expanded.has(g.key) || !!q;
    const anyMontagem = g.idxs.some((i) => freight![i].assembly === "required");
    const amounts = g.idxs.map((i) => freight![i].amount).filter((a) => a > 0);
    const warns = lintByCity.get(g.key);
    const summary = `${g.idxs.length} zona${g.idxs.length > 1 ? "s" : ""}${amounts.length ? ` · ${brl(Math.min(...amounts))}–${brl(Math.max(...amounts))}` : ""}`;
    return (
      <div key={g.key} id={`city-${g.key}`} style={{ ...card, ...flashCard(g.key) }}>
        <div onClick={() => toggle(g.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer" }}>
          <ChevronRight size={16} color="var(--p-muted)" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: bandColor(amounts.length ? Math.min(...amounts) : 0), flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--p-text)" }}>{g.name}</span>
          {anyMontagem && <span title="tem zona com montagem obrigatória" style={{ fontSize: 12 }}>⚙</span>}
          {warns && <span title={warns.join("\n")} style={{ display: "inline-flex", flexShrink: 0 }}><AlertTriangle size={14} color="#eab308" /></span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>{summary}</span>
          <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remover ${g.name} e todas as suas zonas?`)) removeCity(g.idxs); }} title="Remover cidade" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", display: "flex", padding: 4 }}><Trash2 size={14} /></button>
        </div>
        {open && (
          <div style={{ borderTop: "1px solid var(--p-border)", padding: "6px 14px 12px", background: "color-mix(in srgb, var(--p-accent) 3%, transparent)" }}>
            {g.idxs.map((i) => {
              const f = freight![i];
              return (
                <div key={i} style={{ padding: "10px 0", borderTop: g.idxs.indexOf(i) ? "1px dashed var(--p-border)" : "none" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input value={deriveZone(f, g.name)} onChange={(e) => editAt(i, { zone: e.target.value })} placeholder="zona (ex: Central)" list="zone-presets" style={{ ...inp, flex: "1 1 130px", minWidth: 0 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, color: "var(--p-muted)" }}>R$</span>
                      <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })} style={{ ...inp, width: 88 }} />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--p-muted)" }}>
                      <input type="checkbox" checked={f.assembly === "required"} onChange={(e) => editAt(i, { assembly: e.target.checked ? "required" : "optional" })} /> montagem
                    </label>
                    {g.idxs.length > 1 && <button onClick={() => removeAt(i)} title="Remover zona" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", display: "flex", padding: 4 }}><Trash2 size={13} /></button>}
                  </div>
                  <Bairros value={f.neighborhoods ?? []} onChange={(v) => editAt(i, { neighborhoods: v })} inp={inp} />
                </div>
              );
            })}
            <button onClick={() => addZone(g.name, g.code)} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: "1px dashed var(--p-border)", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "var(--p-text)" }}>
              <Plus size={13} /> Adicionar zona
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Truck size={18} color="var(--p-accent)" />
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: "var(--p-text)" }}>Frete por região</h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => setImportOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: "var(--p-surface)", color: "var(--p-text)", fontSize: 13, fontWeight: 600, border: "1px solid var(--p-border)" }}>
          <Upload size={14} /> Importar planilha
        </button>
        <button onClick={save} disabled={!dirty || saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: dirty ? "pointer" : "default", background: dirty ? "var(--p-accent)" : "var(--p-surface)", color: dirty ? "var(--p-on-accent)" : "var(--p-muted)", fontSize: 13, fontWeight: 600, border: dirty ? "none" : "1px solid var(--p-border)" }}>
          <Save size={14} /> {saving ? "Salvando…" : dirty ? "Salvar alterações" : "Salvo"}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--p-muted)", margin: "0 0 16px" }}>
        Cadastre o frete por cidade. Cidades com variação (ex.: Porto Alegre) podem ter várias <b>zonas</b> (Central, Zona Sul, Rural…), cada uma com valor, montagem e os <b>bairros</b> que a IA usa para reconhecer a zona do cliente.
      </p>

      {/* Busca + adicionar cidade (fixo no topo enquanto rola) */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--p-bg)", paddingTop: 4, paddingBottom: 10, marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 8, padding: "8px 10px", flex: "1 1 240px" }}>
            <Search size={14} color="var(--p-muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cidade ou bairro…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--p-text)" }} />
            {q && <X size={14} style={{ cursor: "pointer", color: "var(--p-muted)" }} onClick={() => setQ("")} />}
          </div>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 8, padding: "8px 10px" }}>
              <Plus size={14} color="var(--p-accent)" />
              <input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Adicionar cidade (digite o nome)…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--p-text)" }} />
            </div>
            {addSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.18)", overflow: "hidden" }}>
                {addSuggestions.map((m) => (
                  <button key={m.code} onClick={() => addCity(m)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--p-border)", color: "var(--p-text)", fontSize: 13, cursor: "pointer" }}>{m.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {lintTotal > 0 && (
          <div title={[...lintGeneral].join("\n")} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 12.5, color: "var(--p-text)", background: "color-mix(in srgb, #eab308 12%, transparent)", border: "1px solid color-mix(in srgb, #eab308 40%, transparent)", borderRadius: 8, padding: "6px 10px" }}>
            <AlertTriangle size={14} color="#eab308" />
            <span>{lintTotal} ponto{lintTotal > 1 ? "s" : ""} de atenção no cadastro — veja o ⚠ nas cidades.</span>
          </div>
        )}
      </div>

      {filtered.length === 0 && <div style={{ ...card, padding: 20, textAlign: "center", color: "var(--p-muted)", fontSize: 13 }}>Nenhuma cidade{q ? " encontrada" : " cadastrada"}. Use “Adicionar cidade” ou “Importar planilha”.</div>}

      {/* Seção 1 — cidades COM zonas (editor rico) */}
      {complexGroups.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "4px 2px 8px", fontSize: 12.5, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            <Layers size={13} /> Cidades com zonas ({complexGroups.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {complexGroups.map(renderComplexCard)}
          </div>
        </div>
      )}

      {/* Seção 2 — demais cidades (tabela compacta, valor editável no lugar) */}
      {simpleGroups.length > 0 && (
        <div>
          <div style={{ margin: "4px 2px 8px", fontSize: 12.5, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Demais cidades ({simpleGroups.length})
          </div>
          <div style={{ ...card }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "var(--p-muted)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3 }}>
                    <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Cidade</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, width: 120 }}>Frete</th>
                    <th style={{ textAlign: "center", padding: "8px 10px", fontWeight: 600, width: 130 }}>Montagem obrig.</th>
                    <th style={{ padding: "8px 10px", width: 130 }} />
                  </tr>
                </thead>
                <tbody>
                  {simpleGroups.map((g) => {
                    const i = g.idxs[0]; const f = freight[i]; const warns = lintByCity.get(g.key);
                    return (
                      <tr key={g.key} style={{ borderTop: "1px solid var(--p-border)" }}>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: bandColor(f.amount), flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: "var(--p-text)" }}>{g.name}</span>
                            {warns && <span title={warns.join("\n")} style={{ display: "inline-flex" }}><AlertTriangle size={13} color="#eab308" /></span>}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>R$</span>
                            <input type="number" value={f.amount} onChange={(e) => editAt(i, { amount: Number(e.target.value) })} style={{ ...inp, width: 80 }} />
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <button onClick={() => editAt(i, { assembly: f.assembly === "required" ? "optional" : "required" })}
                            title="Frete com montagem obrigatória" style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, border: "1px solid var(--p-border)", background: f.assembly === "required" ? "var(--p-accent-soft)" : "transparent", color: f.assembly === "required" ? "var(--p-text)" : "var(--p-muted)" }}>
                            ⚙ {f.assembly === "required" ? "sim" : "não"}
                          </button>
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => promoteCity(g)} title="Transformar em cidade com zonas (Central, Zona Sul…)" style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "5px 9px", borderRadius: 7, border: "1px dashed var(--p-border)", background: "transparent", color: "var(--p-text)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <Plus size={12} /> zona
                          </button>
                          <button onClick={() => { if (confirm(`Remover ${g.name}?`)) removeCity(g.idxs); }} title="Remover cidade" style={{ marginLeft: 4, border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", padding: 5, verticalAlign: "middle" }}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <datalist id="zone-presets">{ZONE_PRESETS.map((z) => <option key={z} value={z} />)}</datalist>
      <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 14 }}>{groups.length} cidades · {zonesCount} zonas cadastradas</div>

      {importOpen && (
        <ImportModal existing={freight} geo={{ codeBySlug, nameByCode }} onClose={() => setImportOpen(false)}
          onApply={(merged) => { setFreight(merged); setDirty(true); setImportOpen(false); }} />
      )}
    </div>
  );
}

// Bairros da zona — chips de texto (a IA reconhece o cliente por eles).
function Bairros({ value, onChange, inp }: { value: Neighborhood[]; onChange: (v: Neighborhood[]) => void; inp: React.CSSProperties }) {
  const [t, setT] = useState("");
  const add = () => { const parts = t.split(",").map((s) => s.trim()).filter(Boolean); const nn = parts.filter((p) => !value.some((v) => norm(v.name) === norm(p))).map((name) => ({ name })); if (nn.length) onChange([...value, ...nn]); setT(""); };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 4 }}>Bairros desta zona <span style={{ opacity: 0.7 }}>(a IA reconhece o cliente por eles)</span></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {value.map((b, k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, padding: "2px 7px", borderRadius: 999, background: "var(--p-accent-soft)", color: "var(--p-text)" }}>
            {b.name}<X size={11} style={{ cursor: "pointer" }} onClick={() => onChange(value.filter((_, j) => j !== k))} />
          </span>
        ))}
        {!value.length && <span style={{ fontSize: 11, color: "var(--p-muted)", opacity: 0.7 }}>nenhum ainda</span>}
      </div>
      <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add}
        placeholder="digite um bairro e Enter (ou vários por vírgula)" style={{ ...inp, width: "100%" }} />
    </div>
  );
}

// Modal de importação de planilha — preview obrigatório antes de aplicar (preserva bairros).
const STATUS_META: Record<ImportRow["status"], { label: string; color: string }> = {
  price: { label: "preço muda", color: "#ea580c" }, new: { label: "novo", color: "#16a34a" },
  same: { label: "igual", color: "#64748b" }, unmatched: { label: "não reconhecido", color: "#dc2626" },
};
function ImportModal({ existing, geo, onClose, onApply }: {
  existing: Freight[]; geo: { codeBySlug: Map<string, string>; nameByCode: Map<string, string> };
  onClose: () => void; onApply: (merged: Freight[]) => void;
}) {
  const [text, setText] = useState("");
  const [res, setRes] = useState<{ rows: ImportRow[]; merged: Freight[]; skipped: string[] } | null>(null);
  function analyze() {
    const { rows: parsed, skipped } = parseFreightTable(text);
    const { rows, merged } = buildImportPreview(existing, parsed, geo);
    setRes({ rows, merged, skipped });
  }
  const changes = res ? res.rows.filter((r) => r.status === "new" || r.status === "price").length : 0;
  const box: React.CSSProperties = { background: "var(--p-surface)", color: "var(--p-text)", border: "1px solid var(--p-border)", borderRadius: 12 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...box, width: "min(760px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Upload size={17} color="var(--p-accent)" /><h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Importar planilha de frete</h2>
          <div style={{ flex: 1 }} /><X size={18} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <p style={{ fontSize: 12, color: "var(--p-muted)", margin: "0 0 10px" }}>Cole a tabela (uma região por linha, com o preço). Você vê o que vai mudar <b>antes</b> de aplicar — os bairros já cadastrados são preservados.</p>
        {!res ? (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"Frete Canoas\tR$ 60,00\nFrete Porto Alegre ZS\tR$ 250,00\n…"} style={{ ...box, flex: 1, minHeight: 220, padding: 10, fontSize: 12, fontFamily: "monospace", resize: "vertical", background: "var(--p-bg)" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-text)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={analyze} disabled={!text.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", cursor: text.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>Analisar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "var(--p-muted)", marginBottom: 8 }}>
              {res.rows.filter((r) => r.status === "new").length} novos · {res.rows.filter((r) => r.status === "price").length} com preço alterado · {res.rows.filter((r) => r.status === "same").length} iguais · {res.rows.filter((r) => r.status === "unmatched").length} não reconhecidos{res.skipped.length ? ` · ${res.skipped.length} ignoradas` : ""}
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
              <span style={{ fontSize: 12, color: "var(--p-muted)" }}>Aplicar não salva — revise e clique em Salvar depois.</span>
              <button onClick={() => onApply(res.merged)} disabled={!changes} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: changes ? "var(--p-accent)" : "var(--p-surface)", color: changes ? "var(--p-on-accent)" : "var(--p-muted)", cursor: changes ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>Aplicar {changes} alteraç{changes === 1 ? "ão" : "ões"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
