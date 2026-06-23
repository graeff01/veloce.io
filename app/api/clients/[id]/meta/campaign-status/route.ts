import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v21.0";

// POST /api/clients/[id]/meta/campaign-status  { campaignId, status: "ACTIVE"|"PAUSED" }
// Pausa/reativa uma campanha direto na Meta (sem abrir o Ads Manager). Requer
// token com permissão ads_management — se for só leitura, a Meta recusa e
// devolvemos uma mensagem clara.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const { campaignId, status } = await req.json().catch(() => ({}));
  if (!campaignId || (status !== "ACTIVE" && status !== "PAUSED")) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const conn = await prisma.metaConnection.findUnique({ where: { clientId: id }, select: { id: true, accessToken: true } });
  if (!conn) return NextResponse.json({ error: "Conexão Meta não configurada." }, { status: 404 });

  // A campanha precisa pertencer a esta conexão (evita alterar conta de terceiro).
  const camp = await prisma.metaCampaign.findUnique({
    where: { connectionId_campaignId: { connectionId: conn.id, campaignId } },
    select: { name: true },
  });
  if (!camp) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });

  const token = decryptSecret(conn.accessToken);
  let json: { error?: { code?: number; message?: string }; success?: boolean } = {};
  try {
    const res = await fetch(`${GRAPH}/${campaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status, access_token: token }),
    });
    json = await res.json();
    if (!res.ok || json.error) {
      const err = json.error;
      const code = err?.code;
      let msg = err?.message ?? "Erro ao atualizar a campanha na Meta.";
      if (code === 190) msg = "Token do Meta expirado/revogado. Atualize o token.";
      else if (code === 200 || code === 10 || /permiss|ads_management/i.test(msg)) {
        msg = "O token não tem permissão de gerenciar anúncios (ads_management). Gere um token de System User com essa permissão para pausar pelo sistema.";
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha de rede ao falar com a Meta." }, { status: 502 });
  }

  // Reflete localmente (otimista) — o próximo sync confirma o estado real.
  await prisma.metaCampaign.update({
    where: { connectionId_campaignId: { connectionId: conn.id, campaignId } },
    data: { status },
  }).catch(() => {});

  return NextResponse.json({ ok: true, status });
}
