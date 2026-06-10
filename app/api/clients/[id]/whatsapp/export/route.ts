import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { deriveBadge, BADGE_LABEL } from "@/lib/wa-leads";
import { fmtDuration } from "@/lib/wa-metrics";
import { resolveCampaignByAdIds } from "@/lib/meta-attribution";

export const runtime = "nodejs";

// GET /whatsapp/export?year=&month=&type=ads|all&... (filtros) → CSV mensal.
// Respeita os mesmos filtros da tela. Só dados auditáveis (rastreáveis a mensagens reais).

function norm(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
// (mantido p/ filtro/nome do anúncio; campanha agora resolve por ad_id primeiro)
function canonicalAd(model: string | null, title: string | null): string {
  if (model && model.trim()) return model.trim();
  const t = (title ?? "").trim();
  if (!t) return "Anúncio (sem título)";
  return t.split(/\s+[-–—|]\s+/)[0].trim() || t;
}
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  if (!conn) return new Response("WhatsApp não conectado", { status: 404 });

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;
  const type = url.searchParams.get("type") === "all" ? "all" : "ads";
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  // Filtros (mesmos da tela).
  const fCampaign = url.searchParams.get("campanha") ?? "";
  const fAd = url.searchParams.get("anuncio") ?? "";
  const fStage = url.searchParams.get("funil") ?? "";
  const fValid = url.searchParams.get("valido") ?? "";
  const fOrigin = url.searchParams.get("origem") ?? "";
  const fTag = url.searchParams.get("tag") ?? "";
  const fQ = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  // Universo: leads de anúncio (WaLead) ou todas as conversas do período.
  type Unit = { contactId: string; enteredAt: Date; adModel: string | null; adTitle: string | null; adId: string | null; ctwaClid: string | null; imported: boolean; origin: string };
  let units: Unit[];
  if (type === "ads") {
    const leads = await prisma.waLead.findMany({ where: { connectionId: conn.id, enteredAt: { gte: start, lt: end } }, orderBy: { enteredAt: "desc" } });
    units = leads.map((l) => ({ contactId: l.contactId, enteredAt: l.enteredAt, adModel: l.adModel, adTitle: l.adTitle, adId: l.adId, ctwaClid: l.ctwaClid, imported: l.imported, origin: "Anúncio" }));
  } else {
    const convs = await prisma.waConversation.findMany({ where: { connectionId: conn.id, firstInboundAt: { gte: start, lt: end } }, select: { contactId: true, firstInboundAt: true } });
    const leadByContact = new Map((await prisma.waLead.findMany({ where: { connectionId: conn.id, contactId: { in: convs.map((c) => c.contactId) } } })).map((l) => [l.contactId, l]));
    units = convs.map((c) => {
      const l = leadByContact.get(c.contactId);
      return { contactId: c.contactId, enteredAt: c.firstInboundAt ?? start, adModel: l?.adModel ?? null, adTitle: l?.adTitle ?? null, adId: l?.adId ?? null, ctwaClid: l?.ctwaClid ?? null, imported: l?.imported ?? false, origin: l ? "Anúncio" : "Orgânico" };
    });
  }

  const contactIds = units.map((u) => u.contactId);
  const [contacts, convs, msgs, tagRows, meta] = await Promise.all([
    prisma.waContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, displayName: true, waId: true, reportValid: true, reportInvalidReason: true, notes: true, createdAt: true } }),
    prisma.waConversation.findMany({ where: { contactId: { in: contactIds } }, select: { contactId: true, funnelStage: true, outboundCount: true, firstResponseSec: true, lastMessageAt: true } }),
    contactIds.length ? prisma.waMessage.findMany({ where: { contactId: { in: contactIds }, direction: "in" }, select: { contactId: true, text: true, timestamp: true }, orderBy: [{ timestamp: "asc" }, { id: "asc" }] }) : Promise.resolve([]),
    prisma.waContactTag.findMany({ where: { contactId: { in: contactIds } }, include: { tag: true } }),
    prisma.metaConnection.findUnique({ where: { clientId: id }, include: { insights: { select: { campaignName: true, adsetName: true } } } }).catch(() => null),
  ]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const convBy = new Map(convs.map((c) => [c.contactId, c]));
  const firstMsg = new Map<string, string>(), msgCount = new Map<string, number>(), prevBefore = new Map<string, Date>(), firstIn = new Map<string, Date>();
  for (const m of msgs) {
    if (!firstMsg.has(m.contactId) && m.text) firstMsg.set(m.contactId, m.text);
    msgCount.set(m.contactId, (msgCount.get(m.contactId) ?? 0) + 1);
    if (m.timestamp < start) { const cur = prevBefore.get(m.contactId); if (!cur || m.timestamp > cur) prevBefore.set(m.contactId, m.timestamp); }
    else if (!firstIn.has(m.contactId)) firstIn.set(m.contactId, m.timestamp);
  }
  const tagsBy = new Map<string, string[]>();
  for (const t of tagRows) { const a = tagsBy.get(t.contactId) ?? []; a.push(t.tag.name); tagsBy.set(t.contactId, a); }
  const resolveCampaign = (model: string | null) => {
    if (!model || !meta) return "";
    const key = norm(model); if (!key) return "";
    for (const ins of meta.insights) if (`${norm(ins.campaignName ?? "")} ${norm(ins.adsetName ?? "")}`.includes(key)) return ins.campaignName ?? "";
    return "";
  };
  // ID-first: campanha pelo ad_id (determinístico); fallback p/ match por nome.
  const campByAdId = meta
    ? await resolveCampaignByAdIds(meta.id, units.map((u) => u.adId).filter((x): x is string => !!x))
    : new Map();
  const campaignOf = (u: { adId: string | null; adModel: string | null; adTitle: string | null }) => {
    const a = canonicalAd(u.adModel, u.adTitle);
    return (u.adId && campByAdId.get(u.adId)?.campaignName) || resolveCampaign(a) || a;
  };

  // Aplica filtros sobre as unidades enriquecidas.
  const filtered = units.filter((u) => {
    const c = contactById.get(u.contactId);
    const adName = canonicalAd(u.adModel, u.adTitle);
    const campaign = campaignOf(u);
    const tags = tagsBy.get(u.contactId) ?? [];
    const stage = convBy.get(u.contactId)?.funnelStage ?? "";
    const valid = c?.reportValid !== false;
    if (fOrigin === "ad" && u.origin !== "Anúncio") return false;
    if (fOrigin === "organic" && u.origin !== "Orgânico") return false;
    if (fCampaign && campaign !== fCampaign) return false;
    if (fAd && adName !== fAd) return false;
    if (fStage) { if (fStage === "__none__" ? stage : stage !== fStage) return false; }
    if (fValid === "validos" && !valid) return false;
    if (fValid === "invalidos" && valid) return false;
    if (fTag && !tags.includes(fTag)) return false;
    if (fQ) {
      const hay = `${c?.displayName ?? ""} ${c?.name ?? ""} ${u.contactId} ${firstMsg.get(u.contactId) ?? ""} ${adName} ${campaign} ${tags.join(" ")}`.toLowerCase();
      if (!hay.includes(fQ)) return false;
    }
    return true;
  });

  const header = ["Nome interno", "Nome WhatsApp", "Telefone", "Origem", "Campanha", "Anúncio", "Data de entrada", "Primeira mensagem", "Última mensagem", "Msgs do lead", "Msgs da loja", "Tempo 1ª resposta", "Funil", "Tags", "Situação", "Válido p/ relatório", "Motivo", "Notas", "Importado"];
  const rows = filtered.map((u) => {
    const c = contactById.get(u.contactId);
    const cv = convBy.get(u.contactId);
    const badge = deriveBadge({ createdAt: c?.createdAt ?? u.enteredAt, periodStart: start, prevActivityBefore: prevBefore.get(u.contactId) ?? null, firstActivityInPeriod: firstIn.get(u.contactId) ?? null });
    const fm = firstMsg.get(u.contactId);
    return [
      c?.displayName ?? "",
      c?.name ?? "",
      `+${c?.waId ?? ""}`,
      u.origin,
      campaignOf(u),
      canonicalAd(u.adModel, u.adTitle),
      fmt(u.enteredAt),
      fm && !fm.startsWith("[") ? fm : (fm ? "[mídia]" : ""),
      fmt(cv?.lastMessageAt),
      String(msgCount.get(u.contactId) ?? 0),
      String(cv?.outboundCount ?? 0),
      cv?.firstResponseSec != null ? fmtDuration(cv.firstResponseSec) : "",
      cv?.funnelStage ?? "",
      (tagsBy.get(u.contactId) ?? []).join(", "),
      BADGE_LABEL[badge],
      c?.reportValid === false ? "Não" : "Sim",
      c?.reportInvalidReason ?? "",
      c?.notes ?? "",
      u.imported ? "Sim" : "Não",
    ].map(csvCell).join(";");
  });

  const csv = "﻿" + [header.map(csvCell).join(";"), ...rows].join("\r\n");
  const fname = `leads-${type === "ads" ? "anuncio" : "todos"}-${year}-${String(month).padStart(2, "0")}.csv`;
  return new Response(csv, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
