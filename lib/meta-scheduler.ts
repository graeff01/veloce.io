import { prisma } from "@/lib/prisma";
import { syncMetaAds, MetaTokenError } from "@/lib/meta-sync";

// Auto-sync da Meta dentro do próprio servidor (sem depender de cron externo).
// Iniciado uma vez por instância via instrumentation.register(). Re-sincroniza
// os últimos 3 dias (o spend da Meta finaliza em ~72h). Um token ruim não
// derruba os demais clientes.

let started = false;
const INTERVAL_MS = 6 * 60 * 60 * 1000; // a cada 6h
const FIRST_DELAY_MS = 90 * 1000;       // 90s após subir (deixa o server pronto)

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function runOnce(): Promise<void> {
  let conns: { id: string; clientId: string }[] = [];
  try {
    conns = await prisma.metaConnection.findMany({ select: { id: true, clientId: true } });
  } catch {
    return; // banco indisponível no momento — tenta no próximo ciclo
  }
  if (!conns.length) return;

  // Re-sincroniza o MÊS INTEIRO até hoje (month-to-date). Upsert é idempotente,
  // então re-gravar dias já estáveis não duplica — garante o mês sempre completo
  // mesmo que algum ciclo tenha sido perdido (server reiniciou, etc).
  const now = new Date();
  const since = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const until = ymd(now);

  for (const c of conns) {
    try {
      await syncMetaAds(c.id, since, until);
    } catch (e) {
      if (e instanceof MetaTokenError) {
        console.warn(`[meta-auto-sync] token invalido p/ cliente ${c.clientId} — pulado`);
      } else {
        console.error(`[meta-auto-sync] erro no cliente ${c.clientId}:`, e instanceof Error ? e.message : e);
      }
    }
  }
}

export function startMetaAutoSync(): void {
  if (started) return;
  started = true;
  setTimeout(() => { void runOnce(); }, FIRST_DELAY_MS);
  setInterval(() => { void runOnce(); }, INTERVAL_MS);
  console.log("[meta-auto-sync] agendado (a cada 6h, re-sync dos ultimos 3 dias)");
}
