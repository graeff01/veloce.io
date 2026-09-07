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

/**
 * Mídia local em `data:` URI. O WKWebView do iOS recusa ler `file://` de fora do
 * seu próprio sandbox de leitura, e é por isso que embutir o caminho não bastava
 * para tocar a nota de voz. Embutido no documento, não há acesso a arquivo.
 * Nota de voz do WhatsApp tem dezenas de KB — cabe sem drama.
 */
export async function midiaEmDataUri(caminho: string, mime: string): Promise<string> {
  const b64 = await new File(caminho).base64();
  return `data:${mime};base64,${b64}`;
}

/**
 * Baixa uma imagem PÚBLICA (a foto do catálogo, servida pela Meta ou pelo CDN
 * do cliente) para o cache. Sem credencial: estas URLs são abertas, ao
 * contrário da mídia das conversas.
 */
/**
 * Um arquivo local como parte de `FormData`.
 *
 * O atalho antigo do React Native — `append("file", { uri, name, type })` —
 * deixou de ser aceito: o FormData desta versão segue a especificação e recusa
 * com "Unsupported FormDataPart implementation". A requisição morria no
 * aparelho, sem nunca sair, e aparecia como "falha de rede".
 *
 * Lemos os bytes e montamos um Blob de verdade. Vale para foto, documento e
 * áudio — todo o envio de mídia passava pelo mesmo atalho quebrado.
 */
export async function parteDeArquivo(uri: string, tipo: string): Promise<Blob> {
  const bytes = await new File(uri).bytes();
  return new Blob([bytes as unknown as BlobPart], { type: tipo });
}

export async function baixarImagemPublica(url: string, chave: string): Promise<string> {
  const destino = new File(pasta(), nomeLocal(chave, ".jpg"));

  // Um arquivo VAZIO no cache é pior que nenhum: `exists` diz que está lá, o
  // envio segue com lixo e falha lá na frente sem explicar. Tentativa anterior
  // interrompida deixa exatamente isso.
  if (destino.exists) {
    if ((destino.size ?? 0) > 0) return destino.uri;
    try { destino.delete(); } catch { /* segue e tenta baixar por cima */ }
  }

  const baixado = await File.downloadFileAsync(url, destino, { idempotent: true });
  const arquivo = new File(baixado.uri);
  const tamanho = arquivo.exists ? (arquivo.size ?? 0) : 0;
  if (tamanho <= 0) {
    // Sem isto, o erro só apareceria como "falha de rede" no envio — apontando
    // para o lugar errado.
    log.warn(`imagem do catálogo veio vazia (${new URL(url).host})`);
    throw new Error("Não foi possível baixar a foto do produto.");
  }
  return baixado.uri;
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
