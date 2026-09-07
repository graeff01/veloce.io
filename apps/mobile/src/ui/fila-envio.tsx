// ── Fila de envio ─────────────────────────────────────────────────────────────
// Antes: falhou o envio, aparecia um alerta e o texto voltava para o campo. A
// vendedora no elevador tinha de lembrar de mandar de novo — e ninguém lembra.
//
// Agora a mensagem entra numa fila que sobrevive a fechar o app, e é reenviada
// sozinha quando a rede volta. A bolha fica visível com relógio até confirmar.
//
// Sem biblioteca de rede: detectar conexão exigiria mais uma dependência nativa,
// e cada dependência nova já nos custou um dia de desalinhamento com o Expo Go.
// Em vez disso, tentamos com recuo exponencial enquanto o app está em primeiro
// plano — o efeito prático é o mesmo e o custo é zero.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { comTentativa, daConversa, expiradas, proximo, semItem, type Especie, type Pendente } from "../core/fila";
import { parteDeArquivo } from "./media";
import { ApiError } from "../core/errors";
import { log } from "../core/redact";
import type { VeloceClient } from "../core/client";

const ARQUIVO = "fila-envio.json";

/** Cache, não `document`: é dado de conversa, some junto com o resto no logout. */
function arquivo(): File {
  const pasta = new Directory(Paths.cache, "veloce");
  if (!pasta.exists) pasta.create({ intermediates: true });
  return new File(pasta, ARQUIVO);
}

function ler(): Pendente[] {
  try {
    const f = arquivo();
    if (!f.exists) return [];
    const v = JSON.parse(f.textSync()) as unknown;
    return Array.isArray(v) ? (v as Pendente[]) : [];
  } catch { return []; }
}

function gravar(fila: Pendente[]): void {
  try { arquivo().write(JSON.stringify(fila)); } catch { /* disco cheio: a fila vive em memória */ }
}

export function limparFila(): void {
  try { const f = arquivo(); if (f.exists) f.delete(); } catch { /* nada a fazer */ }
}

interface Valor {
  /** Pendentes desta conversa, na ordem em que foram digitadas. */
  daConversa: (contactId: string) => Pendente[];
  /** Enfileira e tenta na hora. Devolve o id local da bolha otimista. */
  enfileirar: (contactId: string, texto: string) => string;
  /**
   * Mesma fila, para foto/documento/áudio. O arquivo já tem de estar no cache
   * do aparelho — a fila guarda o caminho, não os bytes.
   */
  enfileirarMidia: (
    contactId: string,
    especie: Exclude<Especie, "texto">,
    arquivo: { uri: string; nome: string; tipo: string },
    legenda?: string,
  ) => string;
  /** Quantas aguardam envio em todo o app — alimenta o aviso de conexão. */
  total: number;
}

const Ctx = createContext<Valor | null>(null);

export function FilaEnvioProvider({ client, children }: { client: VeloceClient | null; children: ReactNode }) {
  const [fila, setFila] = useState<Pendente[]>(() => ler());
  const processando = useRef(false);

  // Persiste a cada mudança: fechar o app não pode perder o que foi digitado.
  useEffect(() => { gravar(fila); }, [fila]);

  const novoId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const enfileirar = useCallback((contactId: string, texto: string) => {
    const id = novoId();
    setFila((f) => [...f, { id, contactId, especie: "texto", texto, criadoEm: Date.now(), tentativas: 0 }]);
    return id;
  }, []);

  const enfileirarMidia = useCallback((
    contactId: string,
    especie: Exclude<Especie, "texto">,
    arquivo: { uri: string; nome: string; tipo: string },
    legenda = "",
  ) => {
    const id = novoId();
    setFila((f) => [...f, { id, contactId, especie, texto: legenda, arquivo, criadoEm: Date.now(), tentativas: 0 }]);
    return id;
  }, []);

  /** Uma tentativa por ciclo: manter a ordem importa mais que velocidade. */
  const processar = useCallback(async () => {
    if (!client || processando.current) return;
    const agora = Date.now();

    // Descarta o que envelheceu: responder muito depois é pior que não responder.
    const velhas = expiradas(fila, agora);
    if (velhas.length > 0) {
      log.warn(`fila: ${velhas.length} mensagem(ns) expirada(s)`);
      setFila((f) => velhas.reduce((acc, v) => semItem(acc, v.id), f));
      return;
    }

    const alvo = proximo(fila, agora);
    if (!alvo) return;

    processando.current = true;
    try {
      if (alvo.especie === "texto") {
        await client.sendText(alvo.contactId, alvo.texto);
      } else {
        if (!alvo.arquivo) throw new Error("mídia sem arquivo");
        const form = new FormData();
        form.append("file", await parteDeArquivo(alvo.arquivo.uri, alvo.arquivo.tipo), alvo.arquivo.nome);
        form.append("kind", alvo.especie === "imagem" ? "image" : alvo.especie === "audio" ? "audio" : "document");
        if (alvo.texto.trim()) form.append("caption", alvo.texto.trim());
        await client.sendMedia(alvo.contactId, form);
      }
      setFila((f) => semItem(f, alvo.id));
    } catch (e) {
      // 4xx que não seja de rede não melhora tentando de novo (janela de 24h
      // fechada, por exemplo) — sai da fila e o erro já apareceu na tela.
      const semRede = e instanceof ApiError && e.kind === "offline";
      if (semRede) setFila((f) => comTentativa(f, alvo.id, Date.now()));
      else setFila((f) => semItem(f, alvo.id));
    } finally {
      processando.current = false;
    }
  }, [client, fila]);

  // Roda enquanto houver fila E o app estiver em primeiro plano.
  useEffect(() => {
    if (fila.length === 0) return;
    const tick = () => { if (AppState.currentState === "active") void processar(); };
    tick();
    const id = setInterval(tick, 2_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void processar(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [fila.length, processar]);

  const valor = useMemo<Valor>(() => ({
    daConversa: (contactId: string) => daConversa(fila, contactId),
    enfileirar,
    enfileirarMidia,
    total: fila.length,
  }), [fila, enfileirar, enfileirarMidia]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useFilaEnvio(): Valor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFilaEnvio fora do FilaEnvioProvider");
  return v;
}
