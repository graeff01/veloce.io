import { prisma } from "@/lib/prisma";
import { sendPushToPortalClient } from "./web-push";
import { sendPushToPortalDevices } from "./device-push";
import { gateOnce } from "./dispatch";
import { apnsConfig } from "./apns";

// Alertas de Web Push pros vendedores do portal (com o portal FECHADO). Best-effort:
// resolve o token do portal p/ o link e dispara pra todos os dispositivos inscritos.
//
// DOIS TRANSPORTES, UMA DECISÃO: o PWA recebe por Web Push (VAPID) exatamente como
// sempre; o app iOS recebe por APNs. O QUE dispara e QUANDO não mudou uma linha —
// só passou a existir um segundo destinatário. Sem APNS_* configurado, o ramo do
// aparelho sai imediatamente e nada nesta função muda de comportamento.

export async function pushPortalReview(clientId: string, detail?: string): Promise<void> {
  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true } });
  if (!portal) return;
  const title = "📋 Orçamento pra revisar";
  const body = detail || "Um orçamento aguarda seu aval antes de ir ao cliente.";
  await Promise.all([
    sendPushToPortalClient(clientId, { title, body, url: `/r/${portal.token}/revisao` }).catch(() => {}),
    sendPushToPortalDevices(clientId, { title, body, route: "revisao", collapseId: "revisao" }).catch(() => {}),
  ]);
}

// `ownerEmail`: se a conversa tem DONA, só ela recebe a notificação de fechamento (o cliente
// é dela — feedback da Maria). Sem dona, notifica todos os vendedores (fallback).
export async function pushPortalFechamento(clientId: string, detail?: string, ownerEmail?: string | null): Promise<void> {
  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true } });
  if (!portal) return;
  const title = "🔥 Lead quer fechar";
  const body = detail || "Um lead aprovou o orçamento e quer fechar.";
  // A regra da dona da conversa (`onlyEmail`) vale igual nos dois transportes.
  const only = ownerEmail ? { onlyEmail: ownerEmail } : undefined;
  await Promise.all([
    sendPushToPortalClient(clientId, { title, body, url: `/r/${portal.token}/fechamento` }, only).catch(() => {}),
    sendPushToPortalDevices(clientId, { title, body, route: "fechamento", collapseId: "fechamento" }, only ?? {}).catch(() => {}),
  ]);
}

// ── Mensagem nova do lead ─────────────────────────────────────────────────────
// A maior lacuna do app até aqui: o push só existia para orçamento em revisão e
// para fechamento. O lead escrevia e ninguém era avisado — num app de vendas,
// isso é a função principal.
//
// DUAS DECISÕES DELIBERADAS:
//
// 1. SÓ APARELHO, sem Web Push. O PWA nunca notificou mensagem nova; passar a
//    notificar mudaria o comportamento de quem já usa o portal no navegador, e
//    não é isso que estamos fazendo aqui.
//
// 2. SÓ QUANDO A IA NÃO VAI RESPONDER. Notificar toda mensagem de lead, com a IA
//    atendendo, seriam centenas de avisos por dia e o app seria desinstalado na
//    primeira semana. Quem chama é `respond.ts`, exatamente nos pontos em que
//    decide ficar calada — que é quando o humano precisa entrar.
const JANELA_MS = 10 * 60_000;

export async function pushPortalMensagem(clientId: string, opts: {
  contactId: string;
  contactName: string | null;
  texto: string | null;
  ownerEmail?: string | null;
}): Promise<void> {
  const { contactId, contactName, texto, ownerEmail } = opts;

  // Sem credencial APNs não há para onde mandar: sai ANTES de gravar qualquer
  // coisa. Sem esta linha, cada mensagem de lead que a IA não responde gravaria
  // uma linha de dedupe no banco para um aviso que nunca sairia — e é exatamente
  // o estado de produção hoje, que ainda não tem as chaves da Apple.
  if (!apnsConfig()) return;

  // Rajada de 5 mensagens seguidas do mesmo lead = 1 aviso. A chave carrega a
  // janela de 10 min porque `gateOnce` é permanente por natureza.
  const janela = Math.floor(Date.now() / JANELA_MS);
  if (!(await gateOnce(`portal-msg:${contactId}:${janela}`))) return;

  const nome = (contactName || "").trim() || "Lead";
  // A prévia da mensagem é o que torna o aviso útil na tela de bloqueio — é o
  // mesmo que o WhatsApp faz, no aparelho da própria vendedora. Truncada para
  // não vazar uma conversa inteira em uma notificação.
  const previa = (texto || "").replace(/\s+/g, " ").trim().slice(0, 120);

  await sendPushToPortalDevices(clientId, {
    title: nome,
    body: previa || "Enviou uma mensagem.",
    route: `conversas/${contactId}`,
    collapseId: `conversa:${contactId}`,
    category: "mensagem",   // habilita o botão "Responder" no iOS
    contactId,
  }, ownerEmail ? { onlyEmail: ownerEmail } : {}).catch(() => {});
}
