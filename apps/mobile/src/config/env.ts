// ── Ambiente do app ───────────────────────────────────────────────────────────
// Cola fina entre o Expo e `core/api-base` (que tem toda a regra e os testes).
// Nenhuma URL de produção existe neste arquivo, por decisão de segurança.

import Constants from "expo-constants";
import { resolveApiBase, type AppEnv } from "../core/api-base";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export function appEnv(): AppEnv {
  const raw = String(process.env.EXPO_PUBLIC_APP_ENV ?? extra.appEnv ?? "development").toLowerCase();
  return raw === "production" || raw === "staging" ? raw : "development";
}

/**
 * Base da API. Ordem: variável de ambiente → `extra.apiUrl` → base descoberta no
 * vínculo (o link do painel diz qual servidor é). Se nada existe, `resolveApiBase`
 * lança — configuração ausente é erro visível, nunca um padrão silencioso.
 */
export function apiBase(fromBinding?: string | null): string {
  const configured = process.env.EXPO_PUBLIC_API_URL ?? (extra.apiUrl as string | undefined) ?? fromBinding;
  return resolveApiBase(configured, appEnv());
}

/** Só para telas de diagnóstico: diz o host, nunca credencial. */
export function describeEnv(base: string): string {
  try {
    return `${appEnv()} · ${new URL(base).host}`;
  } catch {
    return appEnv();
  }
}
