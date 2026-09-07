// ── Tema, construído UMA vez ──────────────────────────────────────────────────
// Antes cada tela chamava `buildTheme` por conta própria — dezoito lugares. Como
// a marca vem do `/me`, uma tela que renderizasse antes da sessão chegar caía na
// cor padrão e depois trocava: era o piscar de claro→escuro ao trocar de aba,
// mais visível nos ícones do cabeçalho.
//
// Agora o tema é um objeto só, memorizado na raiz. Toda tela recebe o MESMO —
// não há mais janela para divergir.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useEscuro } from "./aparencia";
import { useSession } from "./session";
import { buildTheme, type Theme } from "./theme";

const Ctx = createContext<Theme | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const escuro = useEscuro();
  // Reconstrói só quando a marca ou o esquema mudam de verdade.
  const tema = useMemo(
    () => buildTheme(me?.brand ?? null, escuro),
    [me?.brand?.accentColor, me?.brand?.mode, me?.brand?.logoUrl, me?.brand?.name, escuro],
  );
  return <Ctx.Provider value={tema}>{children}</Ctx.Provider>;
}

export function useTema(): Theme {
  const t = useContext(Ctx);
  // Fora do provider só acontece na tela de entrada, antes da sessão existir.
  return t ?? buildTheme(null, false);
}
