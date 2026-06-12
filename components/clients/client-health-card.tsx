"use client";

import { useEffect, useState } from "react";

type Status = "ok" | "warn" | "down";
interface Health {
  meta: { connected: boolean; lastSyncAt: string | null; status: Status };
  whatsapp: { connected: boolean; lastEventAt: string | null; status: Status };
}

const DOT: Record<Status, string> = { ok: "#16A34A", warn: "#D97706", down: "#DC2626" };

function ago(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function Row({ label, status, detail }: { label: string; status: Status; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: DOT[status], flexShrink: 0, boxShadow: `0 0 0 3px ${DOT[status]}22` }} />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{detail}</span>
    </div>
  );
}

export function ClientHealthCard({ clientId }: { clientId: string }) {
  const [h, setH] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/clients/${clientId}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setH(d); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientId]);

  if (loading) return <div className="skeleton-surface" style={{ height: 96, borderRadius: 10 }} />;
  if (!h) return null;

  const metaDetail = h.meta.status === "down" ? "Não conectado" : h.meta.lastSyncAt ? `Sync ${ago(h.meta.lastSyncAt)}` : "Nunca sincronizou";
  const waDetail = h.whatsapp.status === "down" ? "Não conectado" : h.whatsapp.lastEventAt ? `Evento ${ago(h.whatsapp.lastEventAt)}` : "Sem eventos";

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
      <Row label="Meta Ads" status={h.meta.status} detail={metaDetail} />
      <div style={{ height: 1, background: "var(--border)" }} />
      <Row label="WhatsApp" status={h.whatsapp.status} detail={waDetail} />
    </div>
  );
}
