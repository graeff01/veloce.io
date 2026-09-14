// Service worker do Veloce — casca do app, offline e Web Push.
//
// O QUE ELE NÃO FAZ, DE PROPÓSITO: não guarda HTML de página nem resposta de
// API. O portal é endereçado por token e mostra conversa de cliente; guardar
// isso no disco do aparelho é risco sem retorno. O que fica em cache é só o
// que não tem dado de ninguém: os pacotes de código (nome com hash, imutáveis),
// os ícones e a página de "sem conexão".
//
// O ganho real do cache aqui é duplo: a navegação entre abas deixa de baixar o
// mesmo JavaScript de novo, e o servidor deixa de servir esses bytes — menos
// conta no fim do mês.

const VERSAO = "v2";
const CASCA = `casca-${VERSAO}`;
const ESTATICO = `estatico-${VERSAO}`;
const MEUS = [CASCA, ESTATICO];

const SEM_CONEXAO = "/offline.html";
const TETO_ESTATICO = 80; // pacotes guardados; acima disso, os mais antigos saem

// ── Instalação ───────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CASCA)
      .then((c) => c.add(SEM_CONEXAO))
      // Uma falha aqui não pode impedir o service worker de instalar.
      .catch(() => {}),
  );
  // Sem skipWaiting aqui: a versão nova espera. Quem decide a hora de trocar é a
  // pessoa, tocando no aviso — trocar embaixo de alguém que está digitando é pior
  // do que esperar.
});

// ── Ativação ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => !MEUS.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// A página pede a troca quando a pessoa toca em "atualizar".
self.addEventListener("message", (event) => {
  if (event.data === "ASSUMIR_AGORA") self.skipWaiting();
});

// ── Estratégias ──────────────────────────────────────────────────────────────

// Pacote com hash no nome nunca muda de conteúdo: servir do disco é sempre certo.
async function doDiscoPrimeiro(req) {
  const cache = await caches.open(ESTATICO);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const resp = await fetch(req);
  if (resp && resp.ok && resp.status === 200) {
    cache.put(req, resp.clone()).then(() => aparar(cache)).catch(() => {});
  }
  return resp;
}

async function aparar(cache) {
  const chaves = await cache.keys();
  if (chaves.length <= TETO_ESTATICO) return;
  // Deploys antigos deixam pacotes órfãos. Os mais antigos saem primeiro.
  await Promise.all(chaves.slice(0, chaves.length - TETO_ESTATICO).map((k) => cache.delete(k)));
}

// Navegação: sempre rede. Sem rede, a página de aviso — nunca uma cópia velha
// de uma conversa, que seria pior do que dizer "estou sem sinal".
async function navegar(req) {
  try {
    return await fetch(req);
  } catch (e) {
    const cache = await caches.open(CASCA);
    const aviso = await cache.match(SEM_CONEXAO);
    return aviso || new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // CDN de terceiro passa direto
  if (url.pathname.startsWith("/api/")) return;      // dado sempre fresco, nunca do disco

  if (req.mode === "navigate") { event.respondWith(navegar(req)); return; }

  if (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icone_atalho/") ||
      url.pathname === "/logo.png" || url.pathname === "/favicon.ico") {
    event.respondWith(doDiscoPrimeiro(req));
  }
});

// ── Web Push ─────────────────────────────────────────────────────────────────
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
