// ── Guarda da credencial: Keychain, nunca AsyncStorage ────────────────────────
// A sessão de aparelho vale 30 dias. AsyncStorage é texto puro no sandbox do app,
// legível em backup de dispositivo — inadequado para credencial. SecureStore usa o
// Keychain do iOS.
//
// `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: a credencial não viaja em backup do iCloud nem
// é restaurada em outro aparelho. Trocar de celular exige login novo — que é o
// comportamento correto para uma credencial vinculada a um `deviceId`.

import * as SecureStore from "expo-secure-store";
import type { SessionStore, StoredSession } from "../core/client";
import { log } from "../core/redact";

const KEY_TOKEN = "veloce.session.token";
const KEY_EXPIRES = "veloce.session.expiresAt";
const KEY_DEVICE = "veloce.device.id";
const KEY_BASE = "veloce.api.base";

const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export class KeychainSessionStore implements SessionStore {
  async read(): Promise<StoredSession | null> {
    const token = await SecureStore.getItemAsync(KEY_TOKEN, OPTS).catch(() => null);
    if (!token) return null;
    const expiresAt = await SecureStore.getItemAsync(KEY_EXPIRES, OPTS).catch(() => null);

    // Expiração conhecida e vencida: nem tenta a rede. O servidor recusaria de
    // qualquer forma, e guardar credencial morta não serve a ninguém.
    if (expiresAt && Date.parse(expiresAt) < Date.now()) {
      log.info("credencial local vencida; removendo");
      await this.clear();
      return null;
    }
    return { token, expiresAt };
  }

  async write(session: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(KEY_TOKEN, session.token, OPTS);
    if (session.expiresAt) await SecureStore.setItemAsync(KEY_EXPIRES, session.expiresAt, OPTS);
    else await SecureStore.deleteItemAsync(KEY_EXPIRES, OPTS).catch(() => {});
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY_TOKEN, OPTS).catch(() => {});
    await SecureStore.deleteItemAsync(KEY_EXPIRES, OPTS).catch(() => {});
    // `deviceId` e a base da API sobrevivem ao logout de propósito: identificam o
    // aparelho e o servidor, não a pessoa. O token do portal nunca esteve aqui.
  }
}

/**
 * Identificador do aparelho: gerado uma vez, estável entre logins, usado apenas
 * para revogar ESTE celular. Não é identidade e não substitui autenticação.
 */
export async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_DEVICE, OPTS).catch(() => null);
  if (existing) return existing;
  const fresh = globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
  await SecureStore.setItemAsync(KEY_DEVICE, fresh, OPTS);
  return fresh;
}

function fallbackUuid(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i++) out += hex[Math.floor(Math.random() * 16)];
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

/** Origem do backend descoberta no vínculo (do link do painel). */
export const apiBaseStore = {
  async read(): Promise<string | null> {
    return SecureStore.getItemAsync(KEY_BASE, OPTS).catch(() => null);
  },
  async write(base: string): Promise<void> {
    await SecureStore.setItemAsync(KEY_BASE, base, OPTS);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY_BASE, OPTS).catch(() => {});
  },
};
