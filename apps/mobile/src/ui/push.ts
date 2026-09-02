// ── Push nativo e deep link ───────────────────────────────────────────────────
// O PWA usa Web Push; o app usa APNs. Aqui pegamos o device token NATIVO (não o
// token do Expo Push Service) — o backend fala direto com a Apple em
// lib/notifications/apns.ts, sem intermediário.
//
// A notificação carrega `route` (ex.: "conversas/abc123"), que vira a tela a abrir.
// Mapear rota é PURO e testado; o resto é integração com o SO.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { VeloceClient } from "../core/client";
import { log } from "../core/redact";
import { rotaDaNotificacao } from "../core/deep-link";

export { rotaDaNotificacao };

/** Como a notificação aparece com o app aberto. */
export function configurarApresentacao(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Pede permissão e registra o aparelho. Best-effort: recusar notificação não
 * pode impedir o uso do app.
 */
export async function registrarPush(client: VeloceClient): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const atual = await Notifications.getPermissionsAsync();
    const concedida = atual.granted
      ? true
      : (await Notifications.requestPermissionsAsync()).granted;
    if (!concedida) {
      log.info("push recusado pelo usuário");
      return false;
    }

    // Device token NATIVO (APNs), não o token do serviço do Expo.
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data !== "string" || !data) return false;

    await client.registerPushToken(data);
    log.info("aparelho registrado para notificações");
    return true;
  } catch (e) {
    // Simulador não emite device token; nunca deve quebrar o boot.
    log.warn("não foi possível registrar push", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Assina os dois caminhos: app aberto e app iniciado a partir da notificação. */
export function ouvirNotificacoes(navegar: (rota: string) => void): () => void {
  const abrir = (resposta: Notifications.NotificationResponse | null) => {
    const dados = resposta?.notification.request.content.data as Record<string, unknown> | undefined;
    const rota = rotaDaNotificacao(dados?.route);
    if (rota) navegar(rota);
  };

  // Cold start: o app subiu porque a pessoa tocou na notificação.
  void Notifications.getLastNotificationResponseAsync().then(abrir);

  const sub = Notifications.addNotificationResponseReceivedListener(abrir);
  return () => sub.remove();
}
