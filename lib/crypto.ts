import crypto from "crypto";

// AES-256-GCM at-rest encryption for secrets (ex.: tokens Meta/WhatsApp).
//
// Chave de cifra: ENCRYPTION_KEY (dedicada). Para retrocompatibilidade total,
// se ENCRYPTION_KEY não existir usa NEXTAUTH_SECRET (comportamento anterior), e
// a decifragem SEMPRE tenta também NEXTAUTH_SECRET(_OLD) — então tokens cifrados
// antes desta mudança continuam decifrando sem migração.
//
// Rotação: defina ENCRYPTION_KEY (nova) e ENCRYPTION_KEY_OLD (anterior) para
// decifrar o legado enquanto re-cifra (scripts/reencrypt-secrets.ts).
const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

export class DecryptError extends Error {}

function keyFrom(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

/**
 * A chave que CIFRA. Sem chave real, recusa — não improvisa.
 *
 * Antes havia um terceiro caso: uma constante escrita neste arquivo. Ela nunca
 * era alcançada em produção (o NextAuth não sobe sem `NEXTAUTH_SECRET`), mas o
 * modo de falha era o pior possível: um ambiente sem as variáveis passaria a
 * cifrar token de WhatsApp e App Secret com uma chave que está no repositório —
 * sem erro, sem aviso, e só se descobriria num vazamento.
 *
 * Um serviço que não sabe cifrar deve se recusar a guardar segredo, não inventar
 * uma chave. A decifragem continua tolerante (ver `decryptKeys`), para nada que
 * já está no banco deixar de ser lido.
 */
function encryptKeySecret(): string {
  const chave = process.env.ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!chave) {
    throw new Error(
      "Sem chave de cifra: defina ENCRYPTION_KEY (ou NEXTAUTH_SECRET). " +
      "Recusando guardar segredo com chave improvisada.",
    );
  }
  return chave;
}

// Ordem de tentativa na decifragem (nova → antiga → legado de sessão).
function decryptKeys(): Buffer[] {
  const secrets: string[] = [];
  if (process.env.ENCRYPTION_KEY) secrets.push(process.env.ENCRYPTION_KEY);
  if (process.env.ENCRYPTION_KEY_OLD) secrets.push(process.env.ENCRYPTION_KEY_OLD);
  if (process.env.NEXTAUTH_SECRET) secrets.push(process.env.NEXTAUTH_SECRET);
  if (process.env.NEXTAUTH_SECRET_OLD) secrets.push(process.env.NEXTAUTH_SECRET_OLD);
  // Só na DECIFRAGEM, e só quando não há chave nenhuma: lê o que um ambiente de
  // desenvolvimento sem variáveis tenha gravado no passado. Não enfraquece nada
  // — cifrar com esta chave deixou de ser possível (ver `encryptKeySecret`), e
  // poder LER um dado que já estava cifrado com chave pública é o que permite
  // recifrá-lo direito em vez de perdê-lo.
  if (secrets.length === 0) secrets.push("veloce-fallback-key");
  return secrets.map(keyFrom);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyFrom(encryptKeySecret()), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  // Valores legados em texto puro (pré-cifragem) são retornados como estão.
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivB, tagB, dataB] = stored.slice(PREFIX.length).split(":");
  const iv = Buffer.from(ivB, "base64");
  const tag = Buffer.from(tagB, "base64");
  const data = Buffer.from(dataB, "base64");
  for (const k of decryptKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, k, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      // tenta a próxima chave
    }
  }
  // FAIL-CLOSED: dado cifrado que nenhuma chave decifra. NUNCA devolver o
  // ciphertext (viraria "token" lixo enviado ao Meta/WhatsApp e mascararia a
  // corrupção). Quem chama trata como "reconecte o token".
  throw new DecryptError("Falha ao decifrar segredo — a chave de cifra pode ter mudado. Reconecte o token.");
}
