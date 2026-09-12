import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireClientAccess } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { assinarAppNaWaba } from "@/lib/whatsapp-assinar";
import { z } from "zod";

const saveSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  appSecret: z.string().optional(),
  displayPhone: z.string().optional(),
  name: z.string().optional(),
  // Quem atende NESTE número, e de que equipe ele é. É daqui que saem as
  // métricas individuais de um cliente em que cada pessoa tem o próprio
  // WhatsApp — ninguém precisa atribuir conversa na mão.
  ownerEmail: z.string().email().optional().or(z.literal("")),
  equipe: z.string().max(60).optional(),
  // Quem ACOMPANHA este número. Com duas gerentes num cliente, é o que separa
  // "os números da Michele" dos "da Vitória" — sem isso as duas veem tudo.
  gestorEmail: z.string().email().optional().or(z.literal("")),
});

/** Edição sem re-colar o token: só o que descreve o número. */
const patchSchema = z.object({
  connectionId: z.string().min(1),
  name: z.string().max(80).optional(),
  displayPhone: z.string().max(40).optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  equipe: z.string().max(60).optional(),
  gestorEmail: z.string().email().optional().or(z.literal("")),
});

const vazioVira = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

function safe(conn: { accessToken: string; appSecret: string | null }) {
  const { accessToken: _a, appSecret: _s, ...rest } = conn;
  return { ...rest, hasToken: true };
}

// GET — conexões do cliente (sem segredos) + contagens.
//
// Devolve uma LISTA porque um cliente pode ter vários números (Jardim do Lago:
// três da consultoria e três da captação). Antes devolvia um objeto só, e do
// segundo número em diante o painel simplesmente não sabia que ele existia.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireClientAccess(id);
  if (error) return error;

  const conns = await prisma.waConnection.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { contacts: true, leads: true, messages: true } } },
  });
  return NextResponse.json(conns.map(safe));
}

// POST — salva/atualiza credenciais do WhatsApp Cloud API
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = saveSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const numero = d.phoneNumberId.trim();
  const jaExiste = await prisma.waConnection.findUnique({
    where: { phoneNumberId: numero },
    select: { clientId: true },
  });
  if (jaExiste && jaExiste.clientId !== id) {
    return NextResponse.json(
      { error: "Este número já está conectado a outro cliente. Remova-o de lá antes de conectar aqui." },
      { status: 409 },
    );
  }

  const conn = await prisma.waConnection.upsert({
    where: { phoneNumberId: numero },
    create: {
      clientId: id,
      wabaId: d.wabaId.trim(),
      phoneNumberId: numero,
      accessToken: encryptSecret(d.accessToken.trim()),
      appSecret: d.appSecret ? encryptSecret(d.appSecret.trim()) : null,
      displayPhone: d.displayPhone ?? null,
      name: d.name ?? null,
      ownerEmail: vazioVira(d.ownerEmail),
      equipe: vazioVira(d.equipe),
      gestorEmail: vazioVira(d.gestorEmail),
    },
    update: {
      wabaId: d.wabaId.trim(),
      phoneNumberId: numero,
      accessToken: encryptSecret(d.accessToken.trim()),
      ...(d.appSecret ? { appSecret: encryptSecret(d.appSecret.trim()) } : {}),
      displayPhone: d.displayPhone ?? null,
      name: d.name ?? null,
      ...(d.ownerEmail !== undefined ? { ownerEmail: vazioVira(d.ownerEmail) } : {}),
      ...(d.equipe !== undefined ? { equipe: vazioVira(d.equipe) } : {}),
      ...(d.gestorEmail !== undefined ? { gestorEmail: vazioVira(d.gestorEmail) } : {}),
    },
    include: { _count: { select: { contacts: true, leads: true, messages: true } } },
  });

  // Mesmo passo do portal: salvar não faz a mensagem chegar. A Meta só entrega
  // os eventos de uma conta para os apps assinados nela.
  const assinatura = await assinarAppNaWaba(conn.wabaId, conn.accessToken);

  return NextResponse.json({
    ...safe(conn),
    recebendo: assinatura.ok,
    aviso: assinatura.ok ? null : assinatura.erro,
  }, { status: 201 });
}

// PATCH — descreve o número (nome, telefone exibido, dono, equipe) SEM exigir
// que se cole o access token de novo. Sem isto, mudar de quem é um número
// obrigaria a reenviar a credencial — um convite a copiar segredo por aí.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  // A conexão precisa ser DESTE cliente: o id vem do navegador.
  const alvo = await prisma.waConnection.findFirst({
    where: { id: d.connectionId, clientId: id },
    select: { id: true },
  });
  if (!alvo) return NextResponse.json({ error: "Conexão não encontrada neste cliente" }, { status: 404 });

  const conn = await prisma.waConnection.update({
    where: { id: alvo.id },
    data: {
      ...(d.name !== undefined ? { name: vazioVira(d.name) } : {}),
      ...(d.displayPhone !== undefined ? { displayPhone: vazioVira(d.displayPhone) } : {}),
      ...(d.ownerEmail !== undefined ? { ownerEmail: vazioVira(d.ownerEmail) } : {}),
      ...(d.equipe !== undefined ? { equipe: vazioVira(d.equipe) } : {}),
      ...(d.gestorEmail !== undefined ? { gestorEmail: vazioVira(d.gestorEmail) } : {}),
    },
    include: { _count: { select: { contacts: true, leads: true, messages: true } } },
  });
  return NextResponse.json(safe(conn));
}

// DELETE — remove UM número (e tudo dele em cascata).
//
// Exige o id da conexão. Antes apagava todas as conexões do cliente de uma vez;
// com seis números no mesmo perfil, isso passa de "desconectar" a "apagar a
// operação inteira" sem nenhum aviso de que era isso que ia acontecer.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const connectionId = new URL(req.url).searchParams.get("connectionId");
  if (!connectionId) {
    return NextResponse.json({ error: "Informe qual número remover (connectionId)" }, { status: 400 });
  }
  const { count } = await prisma.waConnection.deleteMany({ where: { id: connectionId, clientId: id } });
  if (count === 0) return NextResponse.json({ error: "Conexão não encontrada neste cliente" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
