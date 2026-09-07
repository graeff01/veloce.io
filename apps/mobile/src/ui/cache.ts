// ── Cache local ───────────────────────────────────────────────────────────────
// Duas coisas guardadas no aparelho:
//
//   1. A última lista de conversas conhecida, para o app PINTAR NA HORA ao abrir
//      em vez de mostrar um spinner até a rede responder.
//   2. Até quando esta pessoa já viu cada conversa — o divisor "novas mensagens".
//   3. A última versão de cada conversa aberta, para que ela ABRA SEM REDE.
//
// Fica no diretório de CACHE, não em `document`: são dados pessoais de LEADS
// (terceiros), e queremos que o iOS possa descartá-los sozinho quando o aparelho
// apertar. O logout apaga tudo.
//
// O "lida" da EQUIPE mora no servidor (`portalReadAt`) — ler no portal web
// reflete no app e vice-versa. O mapa local abaixo é outra coisa: é só o divisor
// "mensagens novas" DESTE aparelho, que é legitimamente por aparelho.

import { Directory, File, Paths } from "expo-file-system";
import { parseConversation, type Conversation, type ConversationRow } from "../core/contracts";
import { log } from "../core/redact";

const PASTA = "veloce-cache";
const LISTA = "conversas.json";
const LIDAS = "lidas.json";
const CONVERSAS = "conversas";      // subpasta: uma conversa por arquivo
const TETO_CONVERSAS = 40;          // quantas conversas ficam guardadas

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

/** Marca como NÃO lida: esquece a visita, e a conversa volta a destacar. */
export function marcarNaoLida(contactId: string): MapaLidas {
  const mapa = lerLidas();
  delete mapa[contactId];
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

// ── Conversa aberta ───────────────────────────────────────────────────────────
// Abrir uma conversa no elevador, no depósito, no cliente: a rede cai e a
// vendedora precisa LER o que já foi conversado. Guardamos a última versão de
// cada conversa aberta e mostramos ela quando a rede não responde.

/** contactId vem do servidor (cuid), mas nunca confie nele como nome de arquivo. */
const nomeSeguro = (contactId: string): string => contactId.replace(/[^A-Za-z0-9_-]/g, "");

function pastaConversas(): Directory {
  const d = new Directory(pasta(), CONVERSAS);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

/**
 * Só as ÚLTIMAS mensagens: o disco do aparelho não é o banco. Quem quiser o
 * histórico inteiro precisa de rede, e é isso que a tela diz.
 */
export function guardarConversa(contactId: string, c: Conversation): void {
  const id = nomeSeguro(contactId);
  if (!id) return;
  try {
    const f = new File(pastaConversas(), `${id}.json`);
    if (!f.exists) f.create();
    f.write(JSON.stringify({ ...c, items: c.items.slice(-60) }));
    podar();
  } catch {
    // Cache é conveniência: falhar aqui não pode atrapalhar a conversa na tela.
  }
}

/** A conversa guardada, ou null. Passa pelo parse: arquivo velho não quebra a tela. */
export function lerConversa(contactId: string): Conversation | null {
  const id = nomeSeguro(contactId);
  if (!id) return null;
  try {
    const f = new File(pastaConversas(), `${id}.json`);
    if (!f.exists) return null;
    const txt = f.textSync();
    return txt ? parseConversation(JSON.parse(txt)) : null;
  } catch {
    return null; // formato antigo ou arquivo corrompido = sem cache
  }
}

/** Mantém as TETO_CONVERSAS mais recentes; o resto sai. */
function podar(): void {
  try {
    const arquivos = pastaConversas().list().filter((f): f is File => f instanceof File);
    if (arquivos.length <= TETO_CONVERSAS) return;
    arquivos
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0))
      .slice(TETO_CONVERSAS)
      .forEach((f) => { try { f.delete(); } catch { /* já sumiu */ } });
  } catch {
    // Poda é higiene, não correção.
  }
}

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
