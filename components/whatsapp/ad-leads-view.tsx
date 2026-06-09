"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, Megaphone, Users, Layers, Target, CheckCircle2,
  X, Phone, Mic, Image, FileText, Video, ChevronRight,
  ShieldCheck, AlertCircle, Download,
} from "lucide-react";
import { timeAgo, FUNNEL_LABELS } from "@/lib/wa-format";
import type { LeadBadge } from "@/lib/wa-leads";
import { LeadDetails } from "@/components/whatsapp/lead-details";
import { StatusBadge, TagChip } from "@/components/whatsapp/primitives/lead-badges";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FirstMsg { text: string | null; type: string }
interface AdLead {
  id: string; contactId: string; name: string | null; phone: string;
  enteredAt: string; adTitle: string | null; adModel: string | null; adId: string | null;
  adBody: string | null; sourceType: string | null; sourceUrl: string | null; ctwaClid: string | null;
  campaignName: string | null; funnelStage: string | null;
  firstMessage: FirstMsg | null; messageCount: number;
  imported?: boolean;
  displayName?: string | null;
  reportValid?: boolean;
  tags?: { id: string; name: string; color: string }[];
  badge?: LeadBadge;
}
interface AdGroup { adTitle: string; campaignName: string | null; total: number; lastEnteredAt: string | null; negociacao: number; convertido: number }
interface CampaignGroup { name: string; total: number; ads: number; negociacao: number; convertido: number }
interface AuditData {
  totalLeads: number;
  leads: AdLead[];
  ads: AdGroup[];
  campaigns: CampaignGroup[];
}
type Tab = "todos" | "campanhas" | "anuncios" | "validacao";

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  recebido: "#3B82F6", respondido: "#8B5CF6", qualificado: "#F59E0B",
  negociacao: "#10B981", convertido: "#16A34A", perdido: "#EF4444",
};
const PALETTE = ["#7C3AED","#3B82F6","#10B981","#F59E0B","#EF4444","#EC4899","#06B6D4","#8B5CF6"];

// ─── Utils ────────────────────────────────────────────────────────────────────
function avatarColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h + ch.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h];
}
function initials(name: string | null, wa: string) {
  const s = (name ?? wa).trim();
  return s.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function mediaIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    audio: <Mic size={12} />, image: <Image size={12} />,
    document: <FileText size={12} />, video: <Video size={12} />,
  };
  return map[type] ?? null;
}
function mediaLabel(type: string) {
  const map: Record<string, string> = { audio: "Áudio", image: "Imagem", document: "Documento", video: "Vídeo", sticker: "Figurinha" };
  return map[type] ?? type;
}
function msgPreview(m: FirstMsg | null): React.ReactNode {
  if (!m) return <span style={{ opacity: 0.5 }}>—</span>;
  if (m.text && !m.text.startsWith("[")) return m.text;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontStyle: "italic" }}>{mediaIcon(m.type)} {mediaLabel(m.type)}</span>;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, wa, size = 40 }: { name: string | null; wa: string; size?: number }) {
  const color = avatarColor(wa || "x");
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: Math.round(size * 0.36), fontWeight: 700, letterSpacing: "-0.5px", boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 20%, transparent)` }}>
      {initials(name, wa)}
    </div>
  );
}

// ─── Stage chip ───────────────────────────────────────────────────────────────
function StageChip({ stage }: { stage: string | null }) {
  if (!stage) return <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>—</span>;
  const c = STAGE_COLORS[stage] ?? "#64748B";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: c, background: `color-mix(in srgb, ${c} 10%, transparent)`, padding: "3px 9px", borderRadius: 99 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} /> {FUNNEL_LABELS[stage] ?? stage}
    </span>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${accent}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in srgb, ${accent} 10%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 23, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1, margin: 0, letterSpacing: "-0.5px" }}>{value}</p>
        <p style={{ fontSize: 11.5, color: "var(--text-secondary)", margin: "4px 0 0" }}>{label}</p>
      </div>
    </div>
  );
}

// Lê o estado inicial dos filtros da URL (refresh-safe, compartilhável).
function initialParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function AdLeadsView({ clientId, year, month }: { clientId: string; year: number; month: number }) {
  const sp0 = initialParams();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>((sp0.get("aba") as Tab) || "todos");
  const [q, setQ] = useState(sp0.get("q") ?? "");
  const [campaignFilter, setCampaignFilter] = useState(sp0.get("campanha") ?? "");
  const [adFilter, setAdFilter] = useState(sp0.get("anuncio") ?? "");
  const [stageFilter, setStageFilter] = useState(sp0.get("funil") ?? "");
  const [validFilter, setValidFilter] = useState(sp0.get("valido") ?? "");
  const [selected, setSelected] = useState<AdLead | null>(null);

  // Sincroniza filtros → URL sem disparar navegação do Next.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (campaignFilter) sp.set("campanha", campaignFilter);
    if (adFilter) sp.set("anuncio", adFilter);
    if (stageFilter) sp.set("funil", stageFilter);
    if (validFilter) sp.set("valido", validFilter);
    if (tab !== "todos") sp.set("aba", tab);
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, campaignFilter, adFilter, stageFilter, validFilter, tab]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/audit?clientId=${clientId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [clientId, year, month]);

  // Atualização automática (novos leads) sem recarregar a página.
  useEffect(() => {
    const id = setInterval(() => {
      fetch(`/api/audit?clientId=${clientId}&year=${year}&month=${month}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setData(d); })
        .catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, [clientId, year, month]);

  const reload = useCallback(() => {
    fetch(`/api/audit?clientId=${clientId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setData(d); }).catch(() => {});
  }, [clientId, year, month]);

  const clearFilters = () => { setQ(""); setCampaignFilter(""); setAdFilter(""); setStageFilter(""); setValidFilter(""); };
  const hasFilters = q || campaignFilter || adFilter || stageFilter || validFilter;

  const leads = data?.leads ?? [];
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (campaignFilter && (l.campaignName ?? "Sem campanha identificada") !== campaignFilter) return false;
      if (adFilter && (l.adModel ?? l.adTitle ?? "Anúncio (sem título)") !== adFilter) return false;
      if (stageFilter) {
        if (stageFilter === "__none__" ? l.funnelStage : l.funnelStage !== stageFilter) return false;
      }
      if (validFilter === "validos" && l.reportValid === false) return false;
      if (validFilter === "invalidos" && l.reportValid !== false) return false;
      const term = q.trim().toLowerCase();
      if (term) {
        const hay = `${l.displayName ?? ""} ${l.name ?? ""} ${l.phone} ${l.firstMessage?.text ?? ""} ${l.adModel ?? ""} ${l.adTitle ?? ""} ${(l.tags ?? []).map((t) => t.name).join(" ")}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [leads, q, campaignFilter, adFilter, stageFilter, validFilter]);

  // Validação: leads com dados incompletos para o relatório. Importados do Kommo
  // são categoria conhecida (histórico, sem mensagens próprias) → fora da validação.
  const validationLeads = useMemo(() => leads.filter((l) => !l.imported && (!l.adId || !l.campaignName || !l.adTitle || l.messageCount === 0)), [leads]);
  const importedCount = useMemo(() => leads.filter((l) => l.imported).length, [leads]);

  const negociacao = leads.filter((l) => l.funnelStage === "negociacao").length;
  const convertido = leads.filter((l) => l.funnelStage === "convertido").length;
  const fullyValidated = leads.length - validationLeads.length;

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 64, color: "var(--text-muted)" }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 12.5 }}>Carregando leads de anúncio...</span>
    </div>
  );
  if (!data || data.totalLeads === 0) return <EmptyAdLeads />;

  return (
    <>
      <style>{`
        @keyframes adl-spin { to { transform: rotate(360deg); } }
        .adl-spin { animation: adl-spin 1s linear infinite; }
        .adl-row { transition: background 0.1s; }
        .adl-row:hover { background: var(--bg-hover) !important; }
        .adl-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
        .adl-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--border) 80%, transparent); border-radius: 99px; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <a href={`/api/clients/${clientId}/whatsapp/export?year=${year}&month=${month}&type=ads`} download
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, textDecoration: "none", cursor: "pointer" }}>
            <Download size={14} /> Exportar relatório (CSV)
          </a>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <SummaryCard icon={<Users size={16} color="#3B82F6" />} label="Leads de anúncio" value={data.totalLeads} accent="#3B82F6" />
          <SummaryCard icon={<Layers size={16} color="#8B5CF6" />} label="Campanhas com leads" value={data.campaigns.length} accent="#8B5CF6" />
          <SummaryCard icon={<Megaphone size={16} color="var(--accent)" />} label="Anúncios com leads" value={data.ads.length} accent="var(--accent)" />
          <SummaryCard icon={<Target size={16} color="#10B981" />} label="Em negociação" value={negociacao} accent="#10B981" />
          <SummaryCard icon={<CheckCircle2 size={16} color="#16A34A" />} label="Convertidos" value={convertido} accent="#16A34A" />
          <SummaryCard icon={<ShieldCheck size={16} color={validationLeads.length ? "#D97706" : "#16A34A"} />} label="Validados p/ relatório" value={`${fullyValidated}/${leads.length}`} accent={validationLeads.length ? "#D97706" : "#16A34A"} />
        </div>

        {importedCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: "color-mix(in srgb, #8B5CF6 6%, transparent)", border: "1px solid color-mix(in srgb, #8B5CF6 20%, var(--border))" }}>
            <span style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 600 }}>↓</span>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {importedCount} {importedCount === 1 ? "lead importado" : "leads importados"} do Kommo (histórico) — contam no relatório, mas não têm conversa ao vivo no veloce.io.
            </span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
          {([["todos","Todos",leads.length],["campanhas","Campanhas",data.campaigns.length],["anuncios","Anúncios",data.ads.length],["validacao","Validação",validationLeads.length]] as const).map(([k, label, count]) => {
            const active = tab === k;
            const isAlert = k === "validacao" && count > 0;
            return (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
                fontWeight: active ? 600 : 500, color: active ? "var(--text-primary)" : "var(--text-muted)",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {label}
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: isAlert ? "rgba(217,119,6,0.12)" : active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--bg-elevated)", color: isAlert ? "#D97706" : active ? "var(--accent)" : "var(--text-muted)" }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Filters (only on Todos) ── */}
        {tab === "todos" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, borderRadius: 10, background: "var(--bg-surface)", border: "1px solid var(--border)", padding: "0 12px", flex: 1, minWidth: 240 }}>
              <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lead, telefone ou mensagem..." style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text-primary)", fontSize: 13 }} />
            </div>
            <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} style={selectStyle}>
              <option value="">Campanha: todas</option>
              {data.campaigns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select value={adFilter} onChange={(e) => setAdFilter(e.target.value)} style={selectStyle}>
              <option value="">Anúncio: todos</option>
              {data.ads.map((a) => <option key={a.adTitle} value={a.adTitle}>{a.adTitle}</option>)}
            </select>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={selectStyle}>
              <option value="">Funil: todos</option>
              {Object.keys(STAGE_COLORS).map((s) => <option key={s} value={s}>{FUNNEL_LABELS[s]}</option>)}
              <option value="__none__">Sem etapa</option>
            </select>
            <select value={validFilter} onChange={(e) => setValidFilter(e.target.value)} style={selectStyle}>
              <option value="">Relatório: todos</option>
              <option value="validos">Válidos</option>
              <option value="invalidos">Inválidos</option>
            </select>
            {hasFilters && (
              <button onClick={clearFilters} style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <X size={13} /> Limpar
              </button>
            )}
          </div>
        )}

        {/* ── Content ── */}
        {tab === "todos" && <LeadsTable leads={filtered} onSelect={setSelected} />}
        {tab === "campanhas" && <CampaignsTable campaigns={data.campaigns} />}
        {tab === "anuncios" && <AdsTable ads={data.ads} />}
        {tab === "validacao" && <ValidationTable leads={validationLeads} all={leads} onSelect={setSelected} />}
      </div>

      {/* ── Detail drawer ── */}
      {selected && <LeadDetailDrawer clientId={clientId} lead={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </>
  );
}

// ─── Leads table ──────────────────────────────────────────────────────────────
function LeadsTable({ leads, onSelect }: { leads: AdLead[]; onSelect: (l: AdLead) => void }) {
  if (leads.length === 0) return <EmptyState label="Nenhum lead corresponde aos filtros." />;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div className="adl-scroll" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 880 }}>
          {/* header */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.6fr 1.8fr 1fr 1fr 40px", gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            {["Lead","Origem","Primeira mensagem","Entrada","Funil",""].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {leads.map((l) => (
            <button key={l.id} className="adl-row" onClick={() => onSelect(l)} style={{ width: "100%", display: "grid", gridTemplateColumns: "1.6fr 1.6fr 1.8fr 1fr 1fr 40px", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "transparent", border: "none", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--border)", cursor: "pointer", textAlign: "left", alignItems: "center" }}>
              {/* Lead */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Avatar name={l.displayName ?? l.name} wa={l.phone} size={38} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.displayName ?? l.name ?? "Sem nome"}</span>
                    <StatusBadge badge={l.badge} />
                    {l.reportValid === false && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.1)", padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>inválido</span>}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Phone size={9} /> +{l.phone}</span>
                    {l.tags && l.tags.length > 0 && l.tags.slice(0, 2).map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)}
                  </p>
                </div>
              </div>
              {/* Origem */}
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <Megaphone size={11} style={{ color: "var(--accent)", flexShrink: 0 }} /> {l.adModel ?? l.adTitle ?? "Anúncio"}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.campaignName ?? "Campanha não identificada"}</p>
              </div>
              {/* Primeira mensagem */}
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.imported
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#8B5CF6", background: "color-mix(in srgb, #8B5CF6 10%, transparent)", padding: "2px 8px", borderRadius: 99 }}>↓ Importado do Kommo</span>
                  : msgPreview(l.firstMessage)}
              </span>
              {/* Entrada */}
              <div>
                <p style={{ fontSize: 12.5, color: "var(--text-primary)", margin: 0 }}>{fmtDate(l.enteredAt)}, {fmtTime(l.enteredAt)}</p>
                <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "2px 0 0" }}>{timeAgo(l.enteredAt)}</p>
              </div>
              {/* Funil */}
              <div><StageChip stage={l.funnelStage} /></div>
              {/* arrow */}
              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Campaigns table ──────────────────────────────────────────────────────────
function CampaignsTable({ campaigns }: { campaigns: CampaignGroup[] }) {
  if (campaigns.length === 0) return <EmptyState label="Nenhuma campanha no período." />;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 110px 110px", gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
        {["Campanha","Leads","Anúncios","Em negociação","Convertidos"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 0 ? "left" : "right" }}>{h}</span>
        ))}
      </div>
      {campaigns.map((c, i) => (
        <div key={c.name} style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 110px 110px", gap: 12, padding: "13px 18px", borderBottom: i < campaigns.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <Layers size={13} style={{ color: "#8B5CF6", flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>{c.total}</span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "right" }}>{c.ads}</span>
          <span style={{ fontSize: 13, fontWeight: c.negociacao ? 700 : 400, color: c.negociacao ? "#10B981" : "var(--text-muted)", textAlign: "right" }}>{c.negociacao || "—"}</span>
          <span style={{ fontSize: 13, fontWeight: c.convertido ? 700 : 400, color: c.convertido ? "#16A34A" : "var(--text-muted)", textAlign: "right" }}>{c.convertido || "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Ads table ────────────────────────────────────────────────────────────────
function AdsTable({ ads }: { ads: AdGroup[] }) {
  if (ads.length === 0) return <EmptyState label="Nenhum anúncio no período." />;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.4fr 70px 130px 110px", gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
        {["Anúncio","Campanha","Leads","Último lead","Em negociação"].map((h, i) => (
          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i < 2 ? "left" : "right" }}>{h}</span>
        ))}
      </div>
      {ads.map((a, i) => (
        <div key={a.adTitle} style={{ display: "grid", gridTemplateColumns: "1.8fr 1.4fr 70px 130px 110px", gap: 12, padding: "13px 18px", borderBottom: i < ads.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <Megaphone size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.adTitle}</span>
          </span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.campaignName ?? "—"}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>{a.total}</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>{a.lastEnteredAt ? `${fmtDate(a.lastEnteredAt)}, ${fmtTime(a.lastEnteredAt)}` : "—"}</span>
          <span style={{ fontSize: 13, fontWeight: a.negociacao ? 700 : 400, color: a.negociacao ? "#10B981" : "var(--text-muted)", textAlign: "right" }}>{a.negociacao || "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Validation table ─────────────────────────────────────────────────────────
function ValidationTable({ leads, all, onSelect }: { leads: AdLead[]; all: AdLead[]; onSelect: (l: AdLead) => void }) {
  if (all.length > 0 && leads.length === 0) {
    return (
      <div style={{ background: "color-mix(in srgb, #16A34A 5%, var(--bg-surface))", border: "1px solid color-mix(in srgb, #16A34A 25%, var(--border))", borderRadius: 14, padding: "28px 24px", textAlign: "center" }}>
        <ShieldCheck size={30} style={{ color: "#16A34A", margin: "0 auto 12px", display: "block" }} />
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Todos os {all.length} leads estão validados</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0" }}>Referral, campanha, anúncio e mensagem confirmados. Prontos para o relatório mensal.</p>
      </div>
    );
  }
  if (leads.length === 0) return <EmptyState label="Nenhum lead para validar." />;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)", marginBottom: 12 }}>
        <AlertCircle size={15} color="#D97706" />
        <span style={{ fontSize: 12.5, color: "#92600A" }}>{leads.length} lead{leads.length !== 1 ? "s" : ""} com dados incompletos — confira antes de fechar o relatório.</span>
      </div>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr) 40px", gap: 10, padding: "11px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          {["Lead","Referral","Campanha","Anúncio","Mensagem",""].map((h, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 0 ? "left" : "center" }}>{h}</span>
          ))}
        </div>
        {leads.map((l, i) => (
          <button key={l.id} className="adl-row" onClick={() => onSelect(l)} style={{ width: "100%", display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr) 40px", gap: 10, padding: "12px 18px", borderBottom: i < leads.length - 1 ? "1px solid var(--border)" : "none", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <Avatar name={l.name} wa={l.phone} size={34} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name ?? "Sem nome"}</p>
                <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "2px 0 0" }}>+{l.phone}</p>
              </div>
            </div>
            <ValCell ok={!!l.ctwaClid || !!l.adId} />
            <ValCell ok={!!l.campaignName} />
            <ValCell ok={!!l.adTitle} />
            <ValCell ok={l.messageCount > 0} />
            <ChevronRight size={15} style={{ color: "var(--text-muted)" }} />
          </button>
        ))}
      </div>
    </>
  );
}
function ValCell({ ok }: { ok: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {ok ? <CheckCircle2 size={16} style={{ color: "#16A34A" }} /> : <AlertCircle size={16} style={{ color: "#D97706" }} />}
    </div>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
function LeadDetailDrawer({ clientId, lead, onClose, onChanged }: { clientId: string; lead: AdLead; onClose: () => void; onChanged?: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} className="adl-scroll" style={{ width: "min(620px, 92vw)", height: "100%", background: "var(--bg-base)", boxShadow: "-8px 0 40px rgba(15,23,42,0.18)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 3, padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Ficha do lead</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <LeadDetails clientId={clientId} contactId={lead.contactId} badge={lead.badge} campaignName={lead.campaignName} onChanged={onChanged} showTimeline />
      </div>
    </div>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────
function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
      <Search size={16} style={{ opacity: 0.3 }} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}
function EmptyAdLeads() {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: "color-mix(in srgb, var(--accent) 8%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Megaphone size={28} style={{ color: "var(--accent)", opacity: 0.7 }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Nenhum lead de anúncio encontrado</p>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 440, margin: "8px auto 0" }}>
        Ainda não há conversas com referral de anúncio neste período. Quando um lead vier de uma campanha Meta Ads, ele aparece aqui com campanha, anúncio, horário e mensagens.
      </p>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 38, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-surface)",
  color: "var(--text-primary)", padding: "0 10px", fontSize: 12.5, outline: "none", cursor: "pointer", maxWidth: 200,
};
