import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";

// Catálogo do cliente, só leitura, para consulta DURANTE o atendimento.
//
// A vendedora está falando de preço e hoje precisa sair do app para conferir.
// Os itens já existem (a JR tem 61) e nunca tinham saído do banco para o portal.
//
// ADITIVA: rota nova. O PWA não a chama.
//
// Seção `conversas` de propósito: quem atende precisa consultar preço. Amarrar
// a uma seção de catálogo que ninguém tem hoje deixaria a tela vazia para todos.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const itens = await prisma.catalogItem.findMany({
    where: {
      clientId: portal.clientId,
      available: true,
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { title: "asc" },
    take: 200,
    select: { id: true, title: true, price: true, imageUrl: true, url: true },
  });

  return NextResponse.json({
    items: itens.map((i) => ({
      id: i.id,
      title: i.title,
      price: i.price ?? null,
      imageUrl: i.imageUrl ?? null,
      url: i.url ?? null,
    })),
  });
}
