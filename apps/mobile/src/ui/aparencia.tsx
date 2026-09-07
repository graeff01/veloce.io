// ── Aparência ─────────────────────────────────────────────────────────────────
// Até aqui o app seguia cegamente o sistema. Quem atende no WhatsApp muitas
// vezes quer o app claro mesmo com o iPhone no escuro (ou o contrário) — é
// preferência de trabalho, não de sistema.
//
// Fonte única: TODA tela pergunta o esquema a este módulo, nunca ao
// `useColorScheme` diretamente. Assim a escolha vale no app inteiro.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

export type Preferencia = "automatico" | "claro" | "escuro";

const CHAVE = "veloce.aparencia";

interface Valor {
  preferencia: Preferencia;
  /** O esquema em vigor: a escolha do usuário, ou o do iPhone em "Automático". */
  escuro: boolean;
  definir: (p: Preferencia) => void;
}

const Ctx = createContext<Valor | null>(null);

export function AparenciaProvider({ children }: { children: ReactNode }) {
  const doSistema = useColorScheme() === "dark";
  const [preferencia, setPreferencia] = useState<Preferencia>("automatico");

  useEffect(() => {
    void SecureStore.getItemAsync(CHAVE)
      .then((v) => { if (v === "claro" || v === "escuro" || v === "automatico") setPreferencia(v); })
      .catch(() => {});
  }, []);

  const definir = useCallback((p: Preferencia) => {
    setPreferencia(p);
    void SecureStore.setItemAsync(CHAVE, p).catch(() => {});
  }, []);

  const escuro = preferencia === "automatico" ? doSistema : preferencia === "escuro";

  const valor = useMemo<Valor>(() => ({ preferencia, escuro, definir }), [preferencia, escuro, definir]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** O esquema em vigor. Substitui `useColorScheme() === "dark"` nas telas. */
export function useEscuro(): boolean {
  return useContext(Ctx)?.escuro ?? false;
}

/** Só a tela de Aparência precisa disto. */
export function useAparencia(): Valor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAparencia fora do AparenciaProvider");
  return v;
}
