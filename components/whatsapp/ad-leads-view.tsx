"use client";

import { useMemo, useState } from "react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import {
  Search, Megaphone, Users, Target, CheckCircle2,
  X, Phone, Mic, Image, FileText, Video, ChevronRight,
  AlertCircle, Download,
} from "lucide-react";
import { FUNNEL_LABELS } from "@/lib/wa-format";
import type { LeadBadge } from "@/lib/wa-leads";
import { LeadDetails } from "@/components/whatsapp/lead-details";
import { StatusBadge, TagChip } from "@/components/whatsapp/primitives/lead-badges";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FirstMsg { text: string | null; type: string }
interface AdLead {
  id: string; contactId: string; name: string | null; phone: string;
  enteredAt: string; adTitle: string | null; adModel: string | null; adName?: string; adId: string | null;
  adBody: string | null; sourceType: string | null; sourceUrl: string | null; ctwaClid: string | null;
  campaignName: string | null; funnelStage: string | null;
  firstMessage: FirstMsg | null; messageCount: number;
  imported?: boolean;
  displayName?: string | null;
  reportValid?: boolean;
  tags?: { id: string; name: string; color: string }[];
  badge?: LeadBadge;
  storeMessages?: number;
  firstResponseSec?: number | null;
  lastMessageAt?: string | null;
  hasMedia?: boolean; hasAudio?: boolean; hasImage?: boolean;
}
interface AdGroup { adTitle: string; campaignName: string | null; total: number; lastEnteredAt: string | null; negociacao: number; convertido: number }
interface CampaignGroup { name: string; total: number; ads: number; negociacao: number; convertido: number }
interface AuditData {
  totalLeads: number;
  leads: AdLead[];
  ads: AdGroup[];
  campaigns: CampaignGroup[];
}

// Lead agrupado por anúncio (visão drill-down).
interface AdBucket {
  key: string;
  adLabel: string;
  campaign: string | null;
  leads: AdLead[];
  incomplete: number;
  negociacao: number;
  convertido: number;
  lastEnteredAt: string | null;
}

// Tempo de resposta legível.
function fmtResp(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${m % 60 ? ` ${m % 60}min` : ""}` : `${Math.floor(h / 24)}d`;
}

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

// ─── Main ─────────────────────────────────────────────────────────────────────
export function AdLeadsView({ clientId, year, month }: { clientId: string; year: number; month: number }) {
  const [openAdKey, setOpenAdKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdLead | null>(null);

  // Dados com cache + revalidação: aparece na hora ao navegar e o polling
  // pausa quando a aba está oculta (não consome à toa).
  const { data, loading, refresh: reload } = useCachedFetch<AuditData>(
    `/api/audit?clientId=${clientId}&year=${year}&month=${month}`,
    { refreshMs: 20000 },
  );

  const leads = data?.leads ?? [];

  // Selinho de qualidade: leads com dado incompleto para o relatório. Importados
  // do Kommo são categoria conhecida (histórico) → fora da checagem.
  const incompleteIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) {
      if (!l.imported && (!l.adId || !l.campaignName || !l.adTitle || l.messageCount === 0)) s.add(l.id);
    }
    return s;
  }, [leads]);

  // Agrupa os leads por anúncio. Sem anúncio identificado → bucket próprio.
  const adGroups = useMemo<AdBucket[]>(() => {
    const map = new Map<string, AdBucket>();
    for (const l of leads) {
      const adLabel = l.adName ?? l.adModel ?? l.adTitle ?? null;
      const key = adLabel ?? "__none__";
      let g = map.get(key);
      if (!g) {
        g = { key, adLabel: adLabel ?? "Sem anúncio identificado", campaign: l.campaignName ?? null, leads: [], incomplete: 0, negociacao: 0, convertido: 0, lastEnteredAt: null };
        map.set(key, g);
      }
      g.leads.push(l);
      if (incompleteIds.has(l.id)) g.incomplete++;
      if (l.funnelStage === "negociacao") g.negociacao++;
      if (l.funnelStage === "convertido") g.convertido++;
      if (!g.campaign && l.campaignName) g.campaign = l.campaignName;
      if (!g.lastEnteredAt || l.enteredAt > g.lastEnteredAt) g.lastEnteredAt = l.enteredAt;
    }
    return [...map.values()].sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return b.leads.length - a.leads.length;
    });
  }, [leads, incompleteIds]);

  const importedCount = useMemo(() => leads.filter((l) => l.imported).length, [leads]);
  const negociacao = leads.filter((l) => l.funnelStage === "negociacao").length;
  const convertido = leads.filter((l) => l.funnelStage === "convertido").length;
  const adCount = adGroups.filter((g) => g.key !== "__none__").length;
  const openGroup = adGroups.find((g) => g.key === openAdKey) ?? null;

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton-surface" style={{ height: 64, borderRadius: 12 }} />)}
      </div>
      <div className="skeleton-surface" style={{ height: 70, borderRadius: 14 }} />
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton-surface" style={{ height: 70, borderRadius: 14 }} />)}
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
            <Download size={14} /> Exportar relatório CSV
          </a>
        </div>

        {/* ── Summary cards (enxuto) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <SummaryCard icon={<Users size={16} color="#3B82F6" />} label="Leads de anúncio" value={data.totalLeads} accent="#3B82F6" />
          <SummaryCard icon={<Megaphone size={16} color="var(--accent)" />} label="Anúncios com leads" value={adCount} accent="var(--accent)" />
          <SummaryCard icon={<Target size={16} color="#10B981" />} label="Em negociação" value={negociacao} accent="#10B981" />
          <SummaryCard icon={<CheckCircle2 size={16} color="#16A34A" />} label="Convertidos" value={convertido} accent="#16A34A" />
        </div>

        {importedCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: "color-mix(in srgb, #8B5CF6 6%, transparent)", border: "1px solid color-mix(in srgb, #8B5CF6 20%, var(--border))" }}>
            <span style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 600 }}>↓</span>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {importedCount} {importedCount === 1 ? "lead importado" : "leads importados"} do Kommo (histórico) — contam no relatório, mas não têm conversa ao vivo no veloce.io.
            </span>
          </div>
        )}

        {/* Selinho agregado de qualidade do dado */}
        {incompleteIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)" }}>
            <AlertCircle size={14} color="#D97706" />
            <span style={{ fontSize: 12.5, color: "#92600A" }}>
              {incompleteIds.size} {incompleteIds.size === 1 ? "lead" : "leads"} com dado incompleto (sem anúncio/campanha identificada) — confira ao fechar o relatório.
            </span>
          </div>
        )}

        {/* ── Lista de anúncios (clicável → leads no modal) ── */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
          {adGroups.map((g, i) => {
            const isNone = g.key === "__none__";
            return (
              <button key={g.key} className="adl-row" onClick={() => setOpenAdKey(g.key)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "15px 18px",
                borderBottom: i < adGroups.length - 1 ? "1px solid var(--border)" : "none",
                background: "transparent", border: "none", borderBottomStyle: "solid", borderBottomWidth: i < adGroups.length - 1 ? 1 : 0, borderBottomColor: "var(--border)",
                cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: isNone ? "var(--bg-elevated)" : "color-mix(in srgb, var(--accent) 10%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Megaphone size={18} style={{ color: isNone ? "var(--text-muted)" : "var(--accent)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: isNone ? "var(--text-secondary)" : "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.adLabel}</span>
                    {g.incomplete > 0 && (
                      <span title="Leads com dado incompleto" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: "#D97706", background: "rgba(217,119,6,0.12)", padding: "1px 7px", borderRadius: 99, flexShrink: 0 }}>
                        <AlertCircle size={10} /> {g.incomplete}
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {g.campaign ?? "Campanha não identificada"}
                    {g.convertido > 0 ? ` · ${g.convertido} convertido${g.convertido > 1 ? "s" : ""}` : g.negociacao > 0 ? ` · ${g.negociacao} em negociação` : ""}
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.5px" }}>{g.leads.length}</p>
                  <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "1px 0 0" }}>{g.leads.length === 1 ? "lead" : "leads"}</p>
                </div>
                <ChevronRight size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Modal: leads do anúncio ── */}
      {openGroup && (
        <AdLeadsModal group={openGroup} onClose={() => setOpenAdKey(null)} onSelect={setSelected} />
      )}

      {/* ── Detail drawer (por cima do modal) ── */}
      {selected && <LeadDetailDrawer clientId={clientId} lead={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </>
  );
}

// ─── Modal: leads de um anúncio ───────────────────────────────────────────────
function AdLeadsModal({ group, onClose, onSelect }: { group: AdBucket; onClose: () => void; onSelect: (l: AdLead) => void }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return group.leads;
    return group.leads.filter((l) => {
      const hay = `${l.displayName ?? ""} ${l.name ?? ""} ${l.phone} ${l.firstMessage?.text ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [group.leads, q]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(940px, 96vw)", maxHeight: "86vh", background: "var(--bg-base)", borderRadius: 16, boxShadow: "0 24px 70px rgba(15,23,42,0.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, background: "var(--bg-surface)" }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "color-mix(in srgb, var(--accent) 10%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Megaphone size={17} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.adLabel}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>{group.campaign ?? "Campanha não identificada"} · {group.leads.length} {group.leads.length === 1 ? "lead" : "leads"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, borderRadius: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "0 12px", width: 220 }}>
            <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lead..." style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text-primary)", fontSize: 13, minWidth: 0 }} />
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><X size={16} /></button>
        </div>
        {/* Body */}
        <div className="adl-scroll" style={{ overflowY: "auto", padding: 18 }}>
          <LeadsTable leads={filtered} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}

// ─── Leads table ──────────────────────────────────────────────────────────────
function LeadsTable({ leads, onSelect }: { leads: AdLead[]; onSelect: (l: AdLead) => void }) {
  if (leads.length === 0) return <EmptyState label="Nenhum lead corresponde à busca." />;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div className="adl-scroll" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1020 }}>
          {/* header */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.5fr 1.5fr 0.9fr 1fr 0.9fr 40px", gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            {["Lead","Origem","Primeira mensagem","Entrada","Resposta","Funil",""].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {leads.map((l) => (
            <button key={l.id} className="adl-row" onClick={() => onSelect(l)} style={{ width: "100%", display: "grid", gridTemplateColumns: "1.6fr 1.5fr 1.5fr 0.9fr 1fr 0.9fr 40px", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "transparent", border: "none", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--border)", cursor: "pointer", textAlign: "left", alignItems: "center" }}>
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
                  <Megaphone size={11} style={{ color: "var(--accent)", flexShrink: 0 }} /> {l.adName ?? l.adModel ?? l.adTitle ?? "Anúncio"}
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
                <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "2px 0 0" }}>{l.messageCount ?? 0} do lead{l.storeMessages ? ` · ${l.storeMessages} loja` : ""}</p>
              </div>
              {/* Resposta */}
              <div>
                {l.storeMessages && l.storeMessages > 0 ? (
                  <>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: "#16A34A", margin: 0 }}>{l.firstResponseSec != null ? fmtResp(l.firstResponseSec) : "Respondido"}</p>
                    <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "2px 0 0" }}>1ª resposta</p>
                  </>
                ) : l.imported ? (
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>—</span>
                ) : (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "#D97706", background: "rgba(217,119,6,0.1)", padding: "2px 8px", borderRadius: 99 }}>Sem resposta</span>
                )}
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
