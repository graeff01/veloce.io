import crypto from "crypto";

// AES-256-GCM at-rest encryption for secrets (e.g. Meta access tokens).
// Cifragem usa a chave atual (NEXTAUTH_SECRET). Decifragem tenta a chave atual
// e, se houver, a antiga (NEXTAUTH_SECRET_OLD) — permite ROTACIONAR o segredo
// sem precisar re-cifrar todos os tokens de uma vez.
const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

function keyFrom(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

function key(): Buffer {
  return keyFrom(process.env.NEXTAUTH_SECRET ?? "veloce-fallback-key");
}

function decryptKeys(): Buffer[] {
  const secrets = [process.env.NEXTAUTH_SECRET ?? "veloce-fallback-key"];
  if (process.env.NEXTAUTH_SECRET_OLD) secrets.push(process.env.NEXTAUTH_SECRET_OLD);
  return secrets.map(keyFrom);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  // Tolerant: legacy plaintext values (pre-encryption) are returned as-is.
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivB, tagB, dataB] = stored.slice(PREFIX.length).split(":");
  const iv = Buffer.from(ivB, "base64");
  const tag = Buffer.from(tagB, "base64");
  const data = Buffer.from(dataB, "base64");
  // Tenta cada chave válida (atual → antiga). GCM falha alto se a chave errar.
  for (const k of decryptKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, k, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      // tenta a próxima chave
    }
  }
  return stored;
}
