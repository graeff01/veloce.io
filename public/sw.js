// Service worker do Veloce — Web Push.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "Veloce";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Reusa uma janela JÁ ABERTA NO PORTAL (/r/…): no celular essa é a janela do APP
      // instalado (PWA standalone). ANTES focávamos a PRIMEIRA janela qualquer — se houvesse
      // uma aba de navegador solta, ela era "sequestrada" e a aprovação abria com cara de
      // navegador (barra de endereço/favoritos), fora do app. Priorizar a janela do portal
      // mantém a experiência de app; sem nenhuma, openWindow deixa o SO abrir no app instalado.
      const inPortal = list.filter((c) => { try { return new URL(c.url).pathname.indexOf("/r/") === 0; } catch (e) { return false; } });
      const target = inPortal[0] || null;
      if (target && "focus" in target) { try { target.navigate(url); } catch (e) {} return target.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
