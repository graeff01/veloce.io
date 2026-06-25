import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface CreativeMedia {
  video: string | null; // URL do vídeo (Meta CDN, assinada — NÃO contém o token da conta)
  image: string | null; // melhor imagem / poster em alta
  format: string | null; // video | carrossel | imagem (detectado do criativo)
}

// Busca, no servidor, a mídia em alta qualidade do criativo (imagem grande +
// vídeo com play). O access token só é usado aqui, no servidor; o que volta pro
// cliente são URLs assinadas do CDN do Meta, sem segredo. Tudo best-effort.
export async function getCreativeMedia(clientId: string, creativeId: string): Promise<CreativeMedia | null> {
  const conn = await prisma.metaConnection.findUnique({ where: { clientId }, select: { accessToken: true } });
  if (!conn) return null;

  let token: string;
  try { token = decryptSecret(conn.accessToken); } catch { return null; }

  try {
    const r = await fetch(`${GRAPH}/${creativeId}?fields=image_url,thumbnail_url,object_story_spec,asset_feed_spec&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(7000) });
    const c = await r.json();
    if (!r.ok || c.error) return null;

    let image: string | null = c.image_url || c.thumbnail_url || null;

    // procura um video_id no criativo (post único ou feed dinâmico)
    const videoId: string | null =
      c.object_story_spec?.video_data?.video_id ||
      c.asset_feed_spec?.videos?.[0]?.video_id ||
      null;

    // detecta o formato pelo criativo
    const childCount = c.object_story_spec?.link_data?.child_attachments?.length ?? 0;
    const afsImages = c.asset_feed_spec?.images?.length ?? 0;
    const format: string = videoId ? "video" : (childCount > 1 || afsImages > 1) ? "carrossel" : "imagem";

    let video: string | null = null;
    if (videoId) {
      const vr = await fetch(`${GRAPH}/${videoId}?fields=source,picture&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(7000) });
      const v = await vr.json();
      if (vr.ok && !v.error) {
        video = v.source || null;
        if (v.picture) image = v.picture; // frame em alta como poster
      }
    }

    return { video, image, format };
  } catch {
    return null;
  }
}
