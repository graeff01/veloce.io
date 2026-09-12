import { decryptSecret } from "@/lib/crypto";

const GRAPH = "https://graph.facebook.com/v25.0";

// ── Assinar o app na WABA ────────────────────────────────────────────────────
// O passo que faltava, e o mais fácil de esquecer: salvar a credencial NÃO faz
// a mensagem chegar. A Meta só entrega os eventos de uma conta para os apps que
// estão ASSINADOS nela.
//
// Sem isto, quem preenche o formulário vê "conectado com sucesso", vai embora
// satisfeita, e nenhuma mensagem aparece — sem erro e sem pista do porquê. Na
// JR este passo foi feito por um script, à mão, e quem não soubesse disso nunca
// descobriria sozinho.
//
// Idempotente do lado da Meta: assinar duas vezes não faz mal.

export interface ResultadoAssinatura {
  ok: boolean;
  /** Mensagem pronta para mostrar a quem cadastrou — sem jargão de API. */
  erro?: string;
}

/** Erros da Meta que a pessoa consegue resolver, traduzidos. */
function explicar(codigo: number | undefined, mensagem: string): string {
  if (codigo === 190) return "O token não é válido (pode ter expirado ou sido revogado). Gere um novo no Usuário do Sistema.";
  if (codigo === 200 || codigo === 10) return "O token não tem permissão sobre esta conta. Confira se o Usuário do Sistema tem o app E a conta do WhatsApp atribuídos, com whatsapp_business_management.";
  if (codigo === 100) return "A conta do WhatsApp (WABA ID) não foi encontrada. Confira se o ID está certo.";
  return mensagem || "A Meta recusou a assinatura.";
}

/**
 * Assina o app (dono do token) na WABA, para os eventos passarem a chegar.
 *
 * `accessToken` vem CIFRADO do banco — decifra aqui, e nunca sai desta função.
 */
export async function assinarAppNaWaba(wabaId: string, accessTokenCifrado: string): Promise<ResultadoAssinatura> {
  let token: string;
  try {
    token = decryptSecret(accessTokenCifrado);
  } catch {
    return { ok: false, erro: "Não foi possível ler o token salvo. Cadastre o número de novo." };
  }

  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      // Sem corpo: a Meta assina o app DONO do token na conta indicada.
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string; code?: number };
    };

    if (res.ok && corpo.success !== false) return { ok: true };
    return { ok: false, erro: explicar(corpo.error?.code, corpo.error?.message ?? "") };
  } catch {
    // Rede fora, timeout: a credencial ficou salva e vale tentar de novo — não
    // é motivo para desfazer o cadastro.
    return { ok: false, erro: "Não deu para falar com a Meta agora. O número foi salvo; tente reconectar em instantes." };
  }
}

/** A WABA já entrega eventos para este app? Usado para mostrar o estado real. */
export async function appAssinadoNaWaba(wabaId: string, accessTokenCifrado: string): Promise<boolean | null> {
  let token: string;
  try { token = decryptSecret(accessTokenCifrado); } catch { return null; }
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null; // não sabemos: melhor não afirmar nada
    const d = (await res.json()) as { data?: unknown[] };
    return Array.isArray(d.data) && d.data.length > 0;
  } catch {
    return null;
  }
}
