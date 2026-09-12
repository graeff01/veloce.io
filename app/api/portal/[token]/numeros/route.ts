import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";

// GET — os números de WhatsApp do cliente, com quem atende em cada um.
//
// Existe para os ATALHOS: no menu lateral e na barra do celular, WhatsApp e
// Funil abrem a lista de pessoas em vez de ir direto. Antes essa lista vinha
// junto das conversas, o que obrigava a carregar a caixa inteira só para
// desenhar um menu — e deixava o Funil sem como saber quem existe.
//
// Leve de propósito: o atalho não pode esperar.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token);
  if (error) return error;

  const conns = await prisma.waConnection.findMany({
    where: { clientId: portal.clientId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, displayPhone: true, equipe: true, ownerEmail: true },
  });

  return NextResponse.json({
    numeros: conns.map((c) => ({
      id: c.id,
      nome: c.name || c.displayPhone || "Número",
      equipe: c.equipe,
      // Serve para a gestora reconhecer a pessoa quando o número não tem nome.
      dono: c.ownerEmail,
    })),
  });
}
