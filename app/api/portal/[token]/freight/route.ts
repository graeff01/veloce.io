import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Frete por região, SOMENTE LEITURA para o portal. Lê PricingConfig.rules.freight —
// a mesma tabela que a IA usa pra cotar. Escopo pelo token do portal (não é a auth
// interna da Veloce). A escrita ficou com quem tem acesso ao código.
// Passa pelo GATE do portal, como as demais rotas. Antes decidia a autorização
// por conta própria e ficava fora da checagem de seção: uma atendente sem a
// seção "frete" LIA e GRAVAVA a tabela de frete do cliente (o PUT usa o mesmo
// auth do GET). Encontrado testando com o acesso real de uma vendedora da JR.
async function auth(req: Request, token: string) {
  const { error, portal } = await guardPortal(req, token, { section: "frete" });
  if (error) return { error };
  return { clientId: portal.clientId, email: portal.email };
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { clientId, error } = await auth(req, token);
  if (error) return error;
  const pc = await prisma.pricingConfig.findUnique({ where: { clientId } });
  const rules = (pc?.rules ?? {}) as { freight?: unknown };
  return NextResponse.json({ freight: Array.isArray(rules.freight) ? rules.freight : [] });
}

// ── TRANCADO ──────────────────────────────────────────────────────────────────
// A tabela de frete é CADASTRO: é dela que a IA tira o valor que manda pro cliente.
// Cadastro se altera por quem tem acesso ao código, e só. Antes desta trava, quem
// tivesse a seção "frete" no portal gravava preço direto na mesma PricingConfig que
// a IA consulta — sem revisão, sem segunda pessoa, e valendo no atendimento seguinte.
//
// A leitura continua: o cliente vê a tabela inteira, confere e pede a mudança.
// A tentativa de gravar é registrada — se aparecer no log, é sinal de que alguém
// precisa de uma alteração e está esbarrando aqui.
export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { clientId, email, error } = await auth(req, token);
  if (error) return error;

  await recordAudit({
    clientId,
    action: "freight.update.blocked",
    meta: { by: email ?? "portal", motivo: "edicao de frete pelo portal esta desativada" },
  }).catch(() => {});

  return NextResponse.json(
    { error: "A tabela de frete passou a ser somente leitura por aqui. Para alterar um valor, fale com a Veloce — a mudança é feita e revisada por lá." },
    { status: 403 },
  );
}
