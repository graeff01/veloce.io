// ── Mídia autenticada ─────────────────────────────────────────────────────────
// As rotas de mídia e de PDF do portal exigem credencial, então não dá para passar
// a URL direto para <Image source={{uri}}>. Aqui a gente baixa com o header Bearer
// para o diretório de CACHE e devolve um caminho local.
//
// Cache, e não `document`: o iOS pode limpar sozinho quando o aparelho aperta, e é
// isso que queremos — são dados pessoais de LEADS (terceiros), não do usuário do
// app. `limparCacheDeMidia()` roda no logout.

import { Directory, File, Paths } from "expo-file-system";
import type { VeloceClient } from "../core/client";
import { log } from "../core/redact";

const PASTA = "veloce-midia";

function pasta(): Directory {
  const d = new Directory(Paths.cache, PASTA);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

/** Nome de arquivo determinístico e sem PII — derivado só de ids opacos. */
function nomeLocal(chave: string, ext: string): string {
  const limpo = chave.replace(/[^A-Za-z0-9_-]/g, "");
  return `${limpo}${ext}`;
}

/**
 * Baixa (ou reaproveita do cache) um recurso autenticado e devolve o caminho local.
 * `chave` identifica o recurso — normalmente o messageId ou o quoteId.
 */
export async function baixarAutenticado(
  client: VeloceClient,
  url: string,
  chave: string,
  ext: string,
): Promise<string> {
  const destino = new File(pasta(), nomeLocal(chave, ext));
  if (destino.exists) return destino.uri;

  const headers = await client.authHeaders();
  const baixado = await File.downloadFileAsync(url, destino, { headers, idempotent: true });
  return baixado.uri;
}

export async function midiaDaMensagem(
  client: VeloceClient,
  contactId: string,
  messageId: string,
  tipo: string,
): Promise<string> {
  const ext = tipo === "image" ? ".jpg" : tipo === "audio" ? ".m4a" : tipo === "video" ? ".mp4" : ".bin";
  return baixarAutenticado(client, client.mediaPath(contactId, messageId), messageId, ext);
}

export async function pdfDoOrcamento(client: VeloceClient, quoteId: string): Promise<string> {
  return baixarAutenticado(client, client.quotePdfPath(quoteId), `orcamento-${quoteId}`, ".pdf");
}

/** Logout apaga a mídia de leads que ficou no aparelho. */
export function limparCacheDeMidia(): void {
  try {
    const d = new Directory(Paths.cache, PASTA);
    if (d.exists) d.delete();
    log.info("cache de mídia removido");
  } catch {
    // Cache é descartável por definição: falha aqui não pode travar o logout.
  }
}
