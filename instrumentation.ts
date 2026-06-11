// Roda uma vez quando o servidor sobe (Next instrumentation, estável v15+).
// Inicia o auto-sync da Meta — não bloqueia o boot (apenas agenda).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMetaAutoSync } = await import("@/lib/meta-scheduler");
  startMetaAutoSync();
}
