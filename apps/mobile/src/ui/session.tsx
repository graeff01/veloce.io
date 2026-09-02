// ── Estado de sessão do app ───────────────────────────────────────────────────
// Fonte única de: quem está logado, qual cliente (tenant), qual marca e QUAIS
// SEÇÕES existem. As seções vêm do servidor (`/me`) — a UI só desenha o que o
// backend autorizou. Esconder botão nunca é autorização; o servidor recusa de
// novo em cada rota.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { VeloceClient } from "../core/client";
import type { Me, PortalSection } from "../core/contracts";
import { ApiError } from "../core/errors";
import { parseInviteLink } from "../core/link";
import { log } from "../core/redact";
import { KeychainSessionStore, apiBaseStore, deviceId } from "../storage/session-store";
import { apiBase } from "../config/env";

type Status = "carregando" | "sem-sessao" | "logado";

interface SessionValue {
  status: Status;
  me: Me | null;
  client: VeloceClient | null;
  /** Erro de configuração de ambiente (API não configurada, dev apontando p/ prod). */
  configError: string | null;
  can: (section: PortalSection) => boolean;
  vincularELogar: (link: string, email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession fora do SessionProvider");
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("carregando");
  const [me, setMe] = useState<Me | null>(null);
  const [client, setClient] = useState<VeloceClient | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const store = useRef(new KeychainSessionStore()).current;

  /** Cria o cliente HTTP para uma base. `onSessionLost` centraliza o logout. */
  const buildClient = useCallback(
    async (base: string) =>
      new VeloceClient({
        baseUrl: base,
        store,
        device: { id: await deviceId(), name: "iPhone", platform: "ios" },
        onSessionLost: () => {
          setMe(null);
          setStatus("sem-sessao");
        },
      }),
    [store],
  );

  /** Sobe o app: se há credencial no Keychain, confirma com o servidor. */
  const boot = useCallback(async () => {
    try {
      const savedBase = await apiBaseStore.read();
      const base = apiBase(savedBase);
      const c = await buildClient(base);
      setClient(c);
      setConfigError(null);

      const saved = await store.read();
      if (!saved) { setStatus("sem-sessao"); return; }

      // A credencial local não prova nada: quem decide é o servidor (a sessão pode
      // ter sido revogada de outro aparelho).
      const perfil = await c.me();
      if (!perfil.user) { await store.clear(); setStatus("sem-sessao"); return; }
      setMe(perfil);
      setStatus("logado");
    } catch (e) {
      if (e instanceof ApiError) {
        // 401 já limpou o Keychain dentro do cliente.
        setStatus("sem-sessao");
        return;
      }
      // Erro de configuração (sem API, ou dev apontando para produção).
      setConfigError(e instanceof Error ? e.message : "Falha ao iniciar.");
      setStatus("sem-sessao");
    }
  }, [buildClient, store]);

  useEffect(() => { void boot(); }, [boot]);

  const vincularELogar = useCallback(async (link: string, email: string, senha: string) => {
    // O link do painel diz o servidor E o tenant. O token vive só nesta função.
    const invite = parseInviteLink(link);
    const base = apiBase(invite.baseUrl);
    const c = await buildClient(base);

    await c.login(invite.token, email.trim(), senha);
    // A base fica guardada; o token do portal, não — ele sai de escopo aqui.
    await apiBaseStore.write(base);

    const perfil = await c.me();
    setClient(c);
    setMe(perfil);
    setStatus("logado");
    log.info("aparelho vinculado e sessão criada");
  }, [buildClient]);

  const sair = useCallback(async () => {
    await client?.logout().catch(() => {});
    await store.clear();
    setMe(null);
    setStatus("sem-sessao");
  }, [client, store]);

  const recarregar = useCallback(async () => {
    if (!client) return;
    try {
      const perfil = await client.me();
      setMe(perfil);
      if (!perfil.user) setStatus("sem-sessao");
    } catch (e) {
      if (e instanceof ApiError && e.requiresLogout) setStatus("sem-sessao");
    }
  }, [client]);

  const can = useCallback(
    (section: PortalSection) => !!me?.sections.includes(section),
    [me],
  );

  const value = useMemo<SessionValue>(
    () => ({ status, me, client, configError, can, vincularELogar, sair, recarregar }),
    [status, me, client, configError, can, vincularELogar, sair, recarregar],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
