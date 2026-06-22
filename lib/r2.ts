import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 (compatível com S3). Guarda a arte em alta resolução fora do banco.
// Variáveis de ambiente (Railway + .env local):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.R2_BUCKET || "";
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && R2_BUCKET && R2_PUBLIC_URL);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
  }
  return _client;
}

// URL presignada para o navegador subir o arquivo direto no R2 (PUT), sem passar
// pelo servidor — sem limite de body e sem inchar o banco.
export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
}

// URL presignada de download forçando "salvar como" no nome do arquivo (qualidade 100%).
export async function presignDownload(key: string, filename: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, ResponseContentDisposition: `attachment; filename="${filename}"` }), { expiresIn: 300 });
}

export function publicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

// Extrai a key do objeto a partir da URL pública (para presignar o download).
export function keyFromUrl(url: string): string | null {
  if (R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL + "/")) return url.slice(R2_PUBLIC_URL.length + 1);
  return null;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
  "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
};
export function extFor(contentType: string): string {
  return EXT_BY_TYPE[contentType] || "bin";
}
