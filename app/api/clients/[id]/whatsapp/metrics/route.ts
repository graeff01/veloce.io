import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { filtroConexoes } from "@/lib/wa-connections";
import { requireAuth } from "@/lib/api-helpers";

function startOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
}

function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1, 0, 0, 0));
}

function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function avg(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
  const month = Number(url.searchParams.get("month") ?? now.getUTCMonth() + 1);
  const from = startOfMonth(year, month);
  const to = endOfMonth(year, month);

  const conns = await prisma.waConnection.findMany({
    where: { clientId: id }, orderBy: { createdAt: "asc" },
    select: { id: true, displayPhone: true, phoneNumberId: true, lastEventAt: true },
  });
  if (conns.length === 0) return NextResponse.json({ connected: false });
  const connectionId = filtroConexoes(conns.map((c) => c.id));

  const [contactsTotal, messages, leads, contacts] = await Promise.all([
    prisma.waContact.count({ where: { connectionId } }),
    prisma.waMessage.findMany({
      where: { connectionId, timestamp: { gte: from, lt: to } },
      orderBy: { timestamp: "asc" },
      select: { id: true, contactId: true, direction: true, text: true, type: true, timestamp: true },
    }),
    prisma.waLead.findMany({
      where: { connectionId, enteredAt: { gte: from, lt: to } },
      orderBy: { enteredAt: "desc" },
      select: { id: true, contactId: true, name: true, waId: true, adId: true, adTitle: true, sourceType: true, enteredAt: true },
    }),
    prisma.waContact.findMany({
      where: { connectionId },
      select: { id: true, waId: true, name: true, lastMessageAt: true, createdAt: true },
    }),
  ]);

  const messagesByContact = new Map<string, typeof messages>();
  for (const msg of messages) {
    const list = messagesByContact.get(msg.contactId) ?? [];
    list.push(msg);
    messagesByContact.set(msg.contactId, list);
  }

  const responseTimes: number[] = [];
  let inboundAwaitingResponse = 0;
  let conversationsTouched = 0;

  for (const [, list] of messagesByContact) {
    if (list.length > 0) conversationsTouched++;
    let pendingInbound: Date | null = null;
    for (const msg of list) {
      if (msg.direction === "in") {
        if (!pendingInbound) pendingInbound = msg.timestamp;
      } else if (pendingInbound) {
        responseTimes.push(minutesBetween(pendingInbound, msg.timestamp));
        pendingInbound = null;
      }
    }
    if (list.at(-1)?.direction === "in") inboundAwaitingResponse++;
  }

  const inbound = messages.filter((m) => m.direction === "in").length;
  const outbound = messages.filter((m) => m.direction === "out").length;
  const newContacts = contacts.filter((c) => c.createdAt >= from && c.createdAt < to).length;
  const responseRate = inbound === 0 ? null : Math.round((responseTimes.length / inbound) * 100);

  const leadGroups = new Map<string, { adTitle: string; total: number; adId: string | null; sourceType: string | null }>();
  for (const lead of leads) {
    const key = lead.adTitle ?? lead.adId ?? "Sem identificação do anúncio";
    const current = leadGroups.get(key) ?? { adTitle: key, total: 0, adId: lead.adId, sourceType: lead.sourceType };
    current.total++;
    leadGroups.set(key, current);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daily = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    inbound: 0,
    outbound: 0,
    leads: 0,
  }));
  for (const msg of messages) {
    const idx = msg.timestamp.getUTCDate() - 1;
    if (daily[idx]) daily[idx][msg.direction === "in" ? "inbound" : "outbound"]++;
  }
  for (const lead of leads) {
    const idx = lead.enteredAt.getUTCDate() - 1;
    if (daily[idx]) daily[idx].leads++;
  }

  const latestMessages = messages.slice(-8).reverse().map((m) => {
    const contact = contacts.find((c) => c.id === m.contactId);
    return {
      id: m.id,
      contactId: m.contactId,
      name: contact?.name ?? null,
      phone: contact?.waId ?? null,
      direction: m.direction,
      text: m.text,
      type: m.type,
      timestamp: m.timestamp,
    };
  });

  return NextResponse.json({
    connected: true,
    // O cabeçalho descreve o cliente, que pode atender por vários números: mostra
    // o primeiro e diz quantos são, e a atividade mais recente entre todos —
    // senão um número parado esconderia que os outros estão trabalhando.
    connection: {
      displayPhone: conns[0]!.displayPhone,
      phoneNumberId: conns[0]!.phoneNumberId,
      lastEventAt: conns.reduce<Date | null>((maior, c) =>
        c.lastEventAt && (!maior || c.lastEventAt > maior) ? c.lastEventAt : maior, null),
      numeros: conns.length,
    },
    period: { year, month },
    totals: {
      contactsTotal,
      newContacts,
      conversationsTouched,
      leads: leads.length,
      messages: messages.length,
      inbound,
      outbound,
      inboundAwaitingResponse,
    },
    response: {
      avgMinutes: avg(responseTimes),
      medianMinutes: median(responseTimes),
      fastestMinutes: responseTimes.length ? Math.min(...responseTimes) : null,
      slowestMinutes: responseTimes.length ? Math.max(...responseTimes) : null,
      answeredInbound: responseTimes.length,
      responseRate,
    },
    leadGroups: [...leadGroups.values()].sort((a, b) => b.total - a.total),
    daily,
    latestMessages,
  });
}
