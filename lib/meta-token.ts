import { decryptSecret } from "@/lib/crypto";

// Verifica o token Meta via Graph debug_token. Diz se é System User (ideal,
// não expira) ou User (expira ~60d) e quando expira.
export interface MetaTokenInfo {
  valid: boolean;
  type: string | null;        // "SYSTEM_USER" | "USER" | "PAGE" | ...
  isSystemUser: boolean;
  expiresAt: Date | null;     // null = nunca expira
  scopes: string[];
  error: string | null;
}

const GRAPH = "https://graph.facebook.com/v21.0";

export async function checkMetaToken(storedToken: string): Promise<MetaTokenInfo> {
  const token = decryptSecret(storedToken);
  try {
    const res = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
    const json = await res.json();
    if (json.error) return { valid: false, type: null, isSystemUser: false, expiresAt: null, scopes: [], error: json.error.message };
    const d = json.data ?? {};
    const type: string | null = d.type ?? null;
    const expiresAt = d.expires_at && d.expires_at > 0 ? new Date(d.expires_at * 1000) : null;
    return {
      valid: !!d.is_valid,
      type,
      isSystemUser: type === "SYSTEM_USER",
      expiresAt,
      scopes: d.scopes ?? [],
      error: null,
    };
  } catch (e) {
    return { valid: false, type: null, isSystemUser: false, expiresAt: null, scopes: [], error: e instanceof Error ? e.message : "erro" };
  }
}
