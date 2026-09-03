// ── Conversa ao vivo ──────────────────────────────────────────────────────────
// Mantém a conversa ABERTA atualizada sozinha. Antes, se o lead respondesse com
// a tela na frente da vendedora, nada acontecia até ela sair e voltar — o app
// parecia um relatório, não uma conversa.
//
// Só roda em primeiro plano e só com a conversa aberta. Ao sair da tela ou o app
// ir para segundo plano, a conexão fecha: o iOS suspende conexões e quem avisa
// a partir daí é o push.

import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import type { VeloceClient } from "../core/client";
import { abrirSse, type AssinaturaSse } from "../core/sse";
import { log } from "../core/redact";

const RECONEXAO_MS = 4000;

export function useConversaAoVivo(
  client: VeloceClient | null,
  contactId: string | null,
  aoChegarMensagem: () => void,
): void {
  const assinatura = useRef<AssinaturaSse | null>(null);
  const reconectar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ativo = useRef(false);
  const callback = useRef(aoChegarMensagem);
  callback.current = aoChegarMensagem;

  const fechar = useCallback(() => {
    ativo.current = false;
    if (reconectar.current) { clearTimeout(reconectar.current); reconectar.current = null; }
    assinatura.current?.fechar();
    assinatura.current = null;
  }, []);

  const abrir = useCallback(async () => {
    if (!client || !contactId || !ativo.current || assinatura.current) return;
    const headers = await client.authHeaders();
    if (!headers.Authorization || !ativo.current) return;

    assinatura.current = abrirSse({
      url: client.streamPath(contactId),
      headers,
      aoEvento: () => callback.current(),
      aoFechar: () => {
        assinatura.current = null;
        // O servidor derruba conexões longas; reconectar é o comportamento
        // normal de SSE. Só reagenda se a tela ainda estiver ativa.
        if (!ativo.current) return;
        reconectar.current = setTimeout(() => { void abrir(); }, RECONEXAO_MS);
      },
    });
  }, [client, contactId]);

  // Vive enquanto a tela está em foco.
  useFocusEffect(
    useCallback(() => {
      ativo.current = true;
      void abrir();
      return fechar;
    }, [abrir, fechar]),
  );

  // E enquanto o app está em primeiro plano.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") {
        if (!ativo.current) return;
        void abrir();
      } else {
        assinatura.current?.fechar();
        assinatura.current = null;
        log.info("app em segundo plano: stream da conversa fechado");
      }
    });
    return () => sub.remove();
  }, [abrir]);
}
