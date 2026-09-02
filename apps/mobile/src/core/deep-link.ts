// ── Rotas de deep link ────────────────────────────────────────────────────────
// Um payload de push é ENTRADA EXTERNA: só rotas conhecidas viram navegação.
// Puro de propósito — sem isto a regra ficaria dentro de um módulo que importa
// expo-notifications e não daria para testar sem simulador.

const ROTAS_VALIDAS = new Set(["conversas", "revisao", "fechamento", "perfil"]);

export function rotaDaNotificacao(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const limpo = raw.trim().replace(/^\/+/, "");
  if (!limpo) return null;

  const partes = limpo.split("/");
  const base = partes[0];
  if (!base || !ROTAS_VALIDAS.has(base)) return null;

  if (base === "conversas" && partes[1]) {
    const id = partes[1];
    // contactId é cuid: só alfanumérico. Barra a travessia de caminho pelo payload.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    return `/(app)/conversas/${id}`;
  }
  return `/(app)/${base}`;
}
