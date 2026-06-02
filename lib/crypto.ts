import crypto from "crypto";

// AES-256-GCM at-rest encryption for secrets (e.g. Meta access tokens).
// Key is derived from NEXTAUTH_SECRET — no extra env needed.
const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET ?? "veloce-fallback-key";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
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
  try {
    const [ivB, tagB, dataB] = stored.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return stored;
  }
}
