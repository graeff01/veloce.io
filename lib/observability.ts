// Observabilidade leve, sem dependência. Sempre loga o erro estruturado (vira
// busca útil no Railway). Se ERROR_WEBHOOK_URL estiver definido, envia o resumo
// (best-effort, não bloqueia). Inativo por padrão além do log — não muda o sistema.
// Pronto para apontar a um ingest tipo Sentry/Slack quando quiser.

type Ctx = Record<string, unknown>;

export function captureException(err: unknown, context?: Ctx): void {
  const e = err instanceof Error ? err : new Error(String(err));
  const payload = {
    level: "error",
    name: e.name,
    message: e.message,
    stack: e.stack,
    context: context ?? {},
    at: new Date().toISOString(),
  };
  try {
    console.error("[capture]", JSON.stringify(payload));
  } catch {
    console.error("[capture]", e.message);
  }
  const url = process.env.ERROR_WEBHOOK_URL;
  if (url) {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}
