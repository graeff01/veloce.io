"use client";

import { useEffect, useRef } from "react";

// Laço de atualização com porteiro: só bate quando a pessoa está olhando.
//
// Sem isto, um portal aberto no celular no bolso continuava pedindo lista de
// conversas a cada 6 segundos e três contadores a cada 20 — a noite inteira.
// Era bateria e franquia de dados do cliente, e fatura de servidor nossa, para
// atualizar uma tela que ninguém estava vendo.
//
// Ao voltar para a aba, bate na hora: quem volta quer ver o agora, não esperar
// o próximo intervalo.
export function usarPulso(tick: () => void, ms: number, ativo = true) {
  const fn = useRef(tick);
  fn.current = tick;

  useEffect(() => {
    if (!ativo || typeof document === "undefined") return;

    let id: ReturnType<typeof setInterval> | null = null;
    const olhando = () => document.visibilityState === "visible";
    const ligar = () => { if (!id) id = setInterval(() => { if (olhando()) fn.current(); }, ms); };
    const desligar = () => { if (id) { clearInterval(id); id = null; } };

    const mudou = () => {
      if (olhando()) { fn.current(); ligar(); }
      else desligar();
    };

    if (olhando()) ligar();
    document.addEventListener("visibilitychange", mudou);
    window.addEventListener("focus", mudou);
    return () => { desligar(); document.removeEventListener("visibilitychange", mudou); window.removeEventListener("focus", mudou); };
  }, [ms, ativo]);
}
