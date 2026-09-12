import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";
import { encryptSecret } from "@/lib/crypto";
import { assinarAppNaWaba } from "@/lib/whatsapp-assinar";
import { z } from "zod";

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
    where: {
      clientId: portal.clientId,
      // Só os números dela: o atalho não pode oferecer o que ela não alcança.
      ...(portal.conexoesVisiveis ? { id: { in: portal.conexoesVisiveis } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, displayPhone: true, equipe: true, ownerEmail: true },
  });

  return NextResponse.json({
    // A tela precisa saber se oferece o formulário. Oferecer o que o servidor
    // vai recusar faz a pessoa levar a culpa por um problema do produto.
    podeConectar: portal.podeConectar,
    numeros: conns.map((c) => ({
      id: c.id,
      nome: c.name || c.displayPhone || "Número",
      equipe: c.equipe,
      // Serve para a gestora reconhecer a pessoa quando o número não tem nome.
      dono: c.ownerEmail,
    })),
  });
}

// ── Conectar o WhatsApp de um funcionário, pelo portal ───────────────────────
// A gerente cadastra o número de quem trabalha com ela sem depender da agência.
//
// É a escrita mais poderosa do produto: liga um WhatsApp real a um inquilino, e
// o token que ela cola controla a WABA inteira. Daí as quatro travas abaixo —
// nenhuma é opcional.

const conectarSchema = z.object({
  wabaId: z.string().min(1).max(60),
  phoneNumberId: z.string().min(1).max(60),
  accessToken: z.string().min(20).max(1000),
  appSecret: z.string().max(200).optional(),
  displayPhone: z.string().max(40).optional(),
  /** Nome do funcionário — é como o número aparece em toda tela. */
  name: z.string().min(1).max(80),
  equipe: z.string().max(60).optional(),
  /** E-mail que identifica quem atende. Não precisa ter acesso ao portal. */
  ownerEmail: z.string().email().optional().or(z.literal("")),
});

const vazioVira = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // TRAVA 1: permissão própria, concedida uma a uma pela agência. Nem um admin
  // do cliente conecta sem ela.
  const { error, portal } = await guardPortal(req, token, { exigeConectar: true, cost: "llm" });
  if (error) return error;

  const parsed = conectarSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confira os dados: WABA, ID do número, token e o nome de quem atende são obrigatórios." }, { status: 400 });
  }
  const d = parsed.data;
  const numero = d.phoneNumberId.trim();

  // TRAVA 2: o número não pode pertencer a OUTRO cliente. Sem isto, digitar o
  // id de um número alheio sequestraria as conversas dele para cá.
  const jaExiste = await prisma.waConnection.findUnique({
    where: { phoneNumberId: numero },
    select: { clientId: true, gestorEmail: true },
  });
  if (jaExiste && jaExiste.clientId !== portal.clientId) {
    return NextResponse.json(
      { error: "Este número já está conectado em outra conta. Fale com a agência." },
      { status: 409 },
    );
  }
  // TRAVA 3: dentro do mesmo cliente, uma gerente não reescreve o número da
  // outra — nem para "corrigir".
  if (jaExiste && portal.conexoesVisiveis && jaExiste.gestorEmail !== portal.email) {
    return NextResponse.json(
      { error: "Este número é acompanhado por outra pessoa. Fale com a agência." },
      { status: 409 },
    );
  }

  const conn = await prisma.waConnection.upsert({
    where: { phoneNumberId: numero },
    create: {
      clientId: portal.clientId,
      wabaId: d.wabaId.trim(),
      phoneNumberId: numero,
      accessToken: encryptSecret(d.accessToken.trim()),
      appSecret: d.appSecret ? encryptSecret(d.appSecret.trim()) : null,
      displayPhone: vazioVira(d.displayPhone),
      name: d.name.trim(),
      equipe: vazioVira(d.equipe),
      ownerEmail: vazioVira(d.ownerEmail),
      // Nasce no escopo de quem cadastrou: é o número DELA, e aparece no painel
      // dela sem mais nenhum passo.
      gestorEmail: portal.email,
    },
    update: {
      wabaId: d.wabaId.trim(),
      accessToken: encryptSecret(d.accessToken.trim()),
      ...(d.appSecret ? { appSecret: encryptSecret(d.appSecret.trim()) } : {}),
      displayPhone: vazioVira(d.displayPhone),
      name: d.name.trim(),
      equipe: vazioVira(d.equipe),
      ownerEmail: vazioVira(d.ownerEmail),
    },
    select: { id: true, name: true, displayPhone: true, equipe: true, ownerEmail: true, accessToken: true, wabaId: true },
  });

  // ASSINA O APP NA WABA. Sem este passo a credencial fica salva e NENHUMA
  // mensagem chega — sem erro, sem pista. Era feito por script; quem preenchia
  // o formulário não tinha como saber que faltava.
  //
  // Salvar primeiro e assinar depois é de propósito: falha de rede aqui não
  // pode desfazer um cadastro correto — dá para tentar de novo.
  const assinatura = await assinarAppNaWaba(conn.wabaId, conn.accessToken);

  const { accessToken: _t, wabaId: _w, ...publico } = conn;
  void _t; void _w;

  // TRAVA 4: o token NUNCA volta. Nem aqui, nem na listagem — uma vez colado,
  // ele só existe cifrado no banco.
  return NextResponse.json({
    ok: true,
    numero: { ...publico, dono: publico.ownerEmail },
    // A tela precisa dizer a verdade: "salvei, mas ainda não recebe" é uma
    // notícia diferente de "pronto".
    recebendo: assinatura.ok,
    aviso: assinatura.ok ? null : assinatura.erro,
  }, { status: 201 });
}


// ── Corrigir e remover ───────────────────────────────────────────────────────
// O cadastro só sabia ADICIONAR. Como o POST atualiza pelo `phoneNumberId`,
// errar justamente ESSE campo criava um número fantasma que aparecia no painel
// dela para sempre e que ela não tinha como apagar: um erro de digitação virava
// dívida permanente.

const editarSchema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  displayPhone: z.string().max(40).optional(),
  equipe: z.string().max(60).optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
});

/**
 * O número é DESTE cliente e de quem está pedindo para mexer nele?
 *
 * Para ESCRITA a regra é explícita, e de propósito diferente da de leitura:
 * quem acompanha só altera número que é DELA (`gestorEmail`).
 *
 * A regra de leitura tem um fallback — gerente sem nenhum número designado
 * enxerga todos, para a tela não nascer vazia no primeiro acesso. Aplicar esse
 * fallback à escrita seria um buraco: bastava a gerente ficar sem números para
 * ganhar poder de editar e apagar os das colegas. Foi exatamente o que um teste
 * pegou aqui, depois de outro teste remover o último número dela.
 */
async function meuNumero(portal: { clientId: string; email: string | null; somenteLeitura: boolean }, connectionId: string) {
  return prisma.waConnection.findFirst({
    where: {
      id: connectionId,
      clientId: portal.clientId,
      // Gestor: só o que é dele, sem fallback. Admin do cliente com permissão
      // de conectar: qualquer número da casa.
      ...(portal.somenteLeitura ? { gestorEmail: portal.email } : {}),
    },
    select: { id: true, name: true },
  });
}

// PATCH — corrige o que descreve o número. NÃO mexe em credencial: para trocar
// token ou WABA, cadastra de novo pelo POST. Assim um engano de digitação no
// nome nunca passa perto do que faz a conexão funcionar.
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { exigeConectar: true });
  if (error) return error;

  const parsed = editarSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const d = parsed.data;

  if (!(await meuNumero(portal, d.connectionId))) {
    return NextResponse.json({ error: "Número não encontrado." }, { status: 404 });
  }

  const conn = await prisma.waConnection.update({
    where: { id: d.connectionId },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.displayPhone !== undefined ? { displayPhone: vazioVira(d.displayPhone) } : {}),
      ...(d.equipe !== undefined ? { equipe: vazioVira(d.equipe) } : {}),
      ...(d.ownerEmail !== undefined ? { ownerEmail: vazioVira(d.ownerEmail) } : {}),
    },
    select: { id: true, name: true, displayPhone: true, equipe: true, ownerEmail: true },
  });
  return NextResponse.json({ ok: true, numero: { ...conn, dono: conn.ownerEmail } });
}

// DELETE ?connectionId= — remove o número e tudo dele.
//
// Exige `confirmar=<nome do número>` quando ele já tem conversa: apagar um
// número em operação leva junto o histórico de leads reais, e um clique
// distraído não pode fazer isso. Número recém-cadastrado e vazio sai direto —
// é o caso do erro de digitação, e obrigar confirmação ali só atrapalharia.
export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { exigeConectar: true });
  if (error) return error;

  const url = new URL(req.url);
  const connectionId = url.searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "Informe qual número remover." }, { status: 400 });

  const alvo = await meuNumero(portal, connectionId);
  if (!alvo) return NextResponse.json({ error: "Número não encontrado." }, { status: 404 });

  const conversas = await prisma.waContact.count({ where: { connectionId } });
  if (conversas > 0 && url.searchParams.get("confirmar") !== (alvo.name ?? "")) {
    return NextResponse.json({
      error: `Este número tem ${conversas} conversa(s). Para remover, confirme digitando o nome dele.`,
      exigeConfirmacao: true,
      nome: alvo.name,
      conversas,
    }, { status: 409 });
  }

  await prisma.waConnection.delete({ where: { id: connectionId } }); // cascata leva contatos e mensagens
  return NextResponse.json({ ok: true, removidas: conversas });
}
