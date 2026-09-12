import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET (SSE) — tempo real da conversa. Mantém a conexão aberta e EMPURRA um evento assim
// que chega mensagem nova (detecção a cada ~1,2s no servidor). O cliente, ao receber,
// recarrega a conversa. Robusto: reconecta sozinho (EventSource) e o polling do cliente
// segue como rede de segurança. Sem custo externo — é só o nosso servidor.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  // SSE segura conexão + consulta o banco a cada 1,2s: exige sessão e tem cota própria
  // (sem isso, o link sozinho permitia abrir milhares de streams e saturar o pool).
  const { error, portal } = await guardPortal(req, token, { section: "conversas", cost: "stream" });
  if (error) return error;
  const contact = await prisma.waContact.findFirst({
    where: {
      id: contactId,
      connection: { clientId: portal.clientId, ...(portal.conexoesVisiveis ? { id: { in: portal.conexoesVisiveis } } : {}) },
    },
    select: { id: true },
  });
  if (!contact) return new Response("Conversa não encontrada", { status: 404 });

  // Marco inicial: a última mensagem existente. Só empurra o que chegar DEPOIS disso
  // (o cliente já carregou o histórico pela rota normal).
  const last = await prisma.waMessage.findFirst({ where: { contactId }, orderBy: { timestamp: "desc" }, select: { timestamp: true } });
  let since = last?.timestamp ?? new Date(0);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enc = (s: string) => { if (!closed) try { controller.enqueue(encoder.encode(s)); } catch { /* ignore */ } };
      const close = () => { if (closed) return; closed = true; clearInterval(iv); clearInterval(hb); try { controller.close(); } catch { /* ignore */ } };
      req.signal.addEventListener("abort", close);

      enc("retry: 3000\n\n"); // dica de reconexão pro navegador

      const check = async () => {
        if (closed) return;
        try {
          const news = await prisma.waMessage.findMany({
            where: { contactId, timestamp: { gt: since } },
            orderBy: { timestamp: "asc" }, select: { timestamp: true },
          });
          if (news.length) {
            since = news[news.length - 1].timestamp;
            enc(`data: ${JSON.stringify({ n: news.length })}\n\n`);
          }
        } catch { /* ignore — o cliente tem o polling de fallback */ }
      };
      const iv = setInterval(check, 1200);
      const hb = setInterval(() => enc(": hb\n\n"), 20000); // heartbeat: mantém a conexão viva
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
