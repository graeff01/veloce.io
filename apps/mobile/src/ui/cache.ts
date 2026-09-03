// ── Cache local ───────────────────────────────────────────────────────────────
// Duas coisas guardadas no aparelho:
//
//   1. A última lista de conversas conhecida, para o app PINTAR NA HORA ao abrir
//      em vez de mostrar um spinner até a rede responder.
//   2. Até quando esta pessoa já viu cada conversa — o "não lida".
//
// Fica no diretório de CACHE, não em `document`: são dados pessoais de LEADS
// (terceiros), e queremos que o iOS possa descartá-los sozinho quando o aparelho
// apertar. O logout apaga tudo.
//
// LIMITE CONHECIDO: o "não lida" é LOCAL. Se a vendedora ler a conversa no
// portal web, o app continua marcando como não lida. Sincronizar exigiria campo
// novo no servidor e uma decisão de produto (três vendedoras no mesmo número:
// lido por uma é lido por todas?), que ainda não foi tomada.

import { Directory, File, Paths } from "expo-file-system";
import type { ConversationRow } from "../core/contracts";
import { log } from "../core/redact";

const PASTA = "veloce-cache";
const LISTA = "conversas.json";
const LIDAS = "lidas.json";

function pasta(): Directory {
  const d = new Directory(Paths.cache, PASTA);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

function lerJson<T>(nome: string, padrao: T): T {
  try {
    const f = new File(pasta(), nome);
    if (!f.exists) return padrao;
    const txt = f.textSync();
    return txt ? (JSON.parse(txt) as T) : padrao;
  } catch {
    return padrao; // cache corrompido é cache ausente, nunca um erro na tela
  }
}

function escreverJson(nome: string, valor: unknown): void {
  try {
    const f = new File(pasta(), nome);
    if (!f.exists) f.create();
    f.write(JSON.stringify(valor));
  } catch {
    // Falha de escrita é irrelevante: o cache é conveniência, não fonte.
  }
}

// ── Lista de conversas ────────────────────────────────────────────────────────

/** Guarda só a primeira página: o que basta para a primeira pintura. */
export function guardarLista(linhas: ConversationRow[]): void {
  escreverJson(LISTA, linhas.slice(0, 30));
}

export function lerLista(): ConversationRow[] {
  const v = lerJson<ConversationRow[]>(LISTA, []);
  return Array.isArray(v) ? v : [];
}

// ── Conversas lidas ───────────────────────────────────────────────────────────

type MapaLidas = Record<string, string>; // contactId -> ISO da última visita

export function lerLidas(): MapaLidas {
  const v = lerJson<MapaLidas>(LIDAS, {});
  return v && typeof v === "object" ? v : {};
}

/** Marca a conversa como vista agora. Chamado ao abrir a thread. */
export function marcarLida(contactId: string): MapaLidas {
  const mapa = lerLidas();
  mapa[contactId] = new Date().toISOString();
  escreverJson(LIDAS, mapa);
  return mapa;
}

/**
 * Não lida = chegou coisa depois da última visita. Conversa nunca aberta só
 * conta como não lida se a última mensagem for DO LEAD — senão toda conversa
 * antiga nasceria em negrito no primeiro uso.
 */
export function naoLida(c: ConversationRow, lidas: MapaLidas): boolean {
  if (!c.lastMessageAt) return false;
  const visto = lidas[c.contactId];
  if (!visto) return c.lastDirection != null && c.lastDirection !== "out";
  return Date.parse(c.lastMessageAt) > Date.parse(visto);
}

export const contarNaoLidas = (linhas: ConversationRow[], lidas: MapaLidas): number =>
  linhas.reduce((n, c) => n + (naoLida(c, lidas) ? 1 : 0), 0);

/** Logout apaga a lista e o histórico de leitura junto com a mídia. */
export function limparCache(): void {
  try {
    const d = new Directory(Paths.cache, PASTA);
    if (d.exists) d.delete();
    log.info("cache local removido");
  } catch {
    // Cache é descartável: falha aqui não pode travar o logout.
  }
}
