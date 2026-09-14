import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { etagConfere } from "../lib/portal-lista-etag";

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const sw = () => ler("public", "sw.js");

// ── Service worker ───────────────────────────────────────────────────────────

test("o service worker responde a navegação", () => {
  // Sem tratar `fetch` o Chrome não oferece instalar o app, e nada funciona
  // sem sinal. Era o estado anterior: o arquivo só tinha push.
  assert.match(sw(), /addEventListener\("fetch"/);
  assert.match(sw(), /req\.mode === "navigate"/);
});

test("resposta de API nunca vai para o disco", () => {
  // Conversa de cliente não pode ficar guardada no aparelho, e dado de tela
  // não pode vir velho.
  const f = sw();
  assert.match(f, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  const i = f.indexOf('startsWith("/api/")');
  const j = f.indexOf('event.respondWith', i);
  assert.ok(f.slice(i, i + 60).includes("return"),
    "a rota de API tem que sair antes de qualquer respondWith");
  assert.ok(j === -1 || j > i);
});

test("sem rede, a pessoa vê a página de aviso e não uma conversa velha", () => {
  const f = sw();
  assert.match(f, /SEM_CONEXAO = "\/offline\.html"/);
  assert.match(f, /catch[\s\S]{0,200}cache\.match\(SEM_CONEXAO\)/);
  // Navegação não é guardada em cache — só a página de aviso é.
  assert.ok(!/cache\.put\(req[\s\S]{0,80}navigate/.test(f));
});

test("a página de aviso funciona sozinha", () => {
  // Ela é servida do disco, sem servidor e sem rede: nada de fonte externa,
  // folha externa ou script externo.
  const html = ler("public", "offline.html");
  assert.ok(!/<link[^>]+href="http/.test(html), "sem folha externa");
  assert.ok(!/<script[^>]+src=/.test(html), "sem script externo");
  assert.match(html, /window\.addEventListener\("online"/, "volta sozinha quando o sinal volta");
});

test("a versão nova não troca embaixo de quem está digitando", () => {
  const f = sw();
  // skipWaiting só a pedido da página, nunca no install.
  const instalar = f.slice(f.indexOf('addEventListener("install"'), f.indexOf('addEventListener("activate"'));
  assert.ok(!/self\.skipWaiting\(\)/.test(instalar), "install não pode assumir sozinho");
  assert.match(f, /event\.data === "ASSUMIR_AGORA"[\s\S]{0,60}skipWaiting/);
});

test("o push continua funcionando", () => {
  // Isto já estava no ar e resolveu um bug real (notificação abrindo com cara
  // de navegador). Não pode ter se perdido na reescrita.
  const f = sw();
  assert.match(f, /addEventListener\("push"/);
  assert.match(f, /addEventListener\("notificationclick"/);
  assert.match(f, /pathname\.indexOf\("\/r\/"\) === 0/, "prioriza a janela do portal");
});

test("cache antigo é apagado e não cresce sem limite", () => {
  const f = sw();
  assert.match(f, /caches\.delete/);
  assert.match(f, /TETO_ESTATICO/);
});

// ── Registro e casca ─────────────────────────────────────────────────────────

test("o service worker é registrado para todo mundo", () => {
  // Antes só era registrado dentro do fluxo de push, atrás de duas condições:
  // o cliente ter fila E a permissão já concedida. Quase ninguém tinha.
  const pwa = ler("components", "portal", "portal-pwa.tsx");
  assert.match(pwa, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  const layout = ler("app", "r", "[token]", "layout.tsx");
  assert.match(layout, /<PortalPWA \/>/);
});

test("o notch só é respeitado com viewport-fit", () => {
  // Todo o env(safe-area-inset-*) espalhado pelas telas resolve para ZERO no
  // iPhone sem isto.
  const layout = ler("app", "r", "[token]", "layout.tsx");
  assert.match(layout, /viewportFit: "cover"/);
});

test("o convite de instalar respeita quem disse não", () => {
  const pwa = ler("components", "portal", "portal-pwa.tsx");
  assert.match(pwa, /beforeinstallprompt/);
  assert.match(pwa, /localStorage\.getItem\(CHAVE_CONVITE\)/);
  assert.match(pwa, /ehIOS\(\)/, "iOS não tem o evento; precisa da instrução manual");
  assert.match(pwa, /jaInstalado\(\)/, "não convidar quem já instalou");
});

// ── Manifest ─────────────────────────────────────────────────────────────────

test("a primeira visita não recarrega sozinha", () => {
  // `clients.claim()` dispara controllerchange também na PRIMEIRA instalação,
  // quando o controlador vai de nada para alguém. Recarregar aí é um susto sem
  // motivo, na cara de quem está abrindo o app pela primeira vez.
  const pwa = ler("components", "portal", "portal-pwa.tsx");
  assert.match(pwa, /const tinhaControle = !!navigator\.serviceWorker\.controller/);
  assert.match(pwa, /if \(!tinhaControle \|\| recarregando\) return/);
});

test("o aviso de versão nova não aparece na primeira instalação", () => {
  const pwa = ler("components", "portal", "portal-pwa.tsx");
  assert.match(pwa, /!navigator\.serviceWorker\.controller\) return/);
});

test("o manifest tem identidade e atalhos", () => {
  const m = ler("app", "r", "[token]", "manifest.webmanifest", "route.ts");
  assert.match(m, /id: `\/r\/\$\{token\}`/, "sem id o Android instala duplicado ao mudar a start_url");
  assert.match(m, /shortcuts:/);
});

test("o ícone adaptativo é opt-in, para não cortar a marca do cliente", () => {
  const m = ler("app", "r", "[token]", "manifest.webmanifest", "route.ts");
  assert.match(m, /-maskable\.png/);
  assert.match(m, /\.\.\.\(maskable \?/, "só entra quando existe arquivo próprio");
});

test("o manifest interno não mente o tamanho do ícone", () => {
  const m = JSON.parse(ler("public", "manifest.json"));
  // Antes o mesmo arquivo 512 era declarado como 192 e como 512.
  const tamanhos = m.icons.map((i: { sizes: string }) => i.sizes);
  assert.deepEqual(tamanhos, ["512x512"]);
});

// ── Custo ────────────────────────────────────────────────────────────────────

test("os contadores do menu param quando ninguém olha", () => {
  const shell = ler("components", "portal", "portal-shell.tsx");
  const pulsos = shell.match(/usarPulso\(/g) ?? [];
  assert.equal(pulsos.length, 3, "os três contadores passam pelo porteiro");
  assert.ok(!/setInterval\(tick/.test(shell), "não pode sobrar laço sem porteiro");
});

test("o porteiro desliga o laço em vez de só ignorar a batida", () => {
  const h = ler("components", "portal", "usar-pulso.ts");
  assert.match(h, /visibilitychange/);
  assert.match(h, /clearInterval/);
  assert.match(h, /if \(olhando\(\)\) \{ fn\.current\(\); ligar\(\); \}/,
    "ao voltar para a aba, atualiza na hora");
});

test("a lista pergunta antes de pedir tudo de novo", () => {
  const rota = ler("app", "api", "portal", "[token]", "conversations", "route.ts");
  assert.match(rota, /impressaoDaLista/);
  assert.match(rota, /status: 304/);
  // O 304 tem que vir ANTES das consultas pesadas, senão não economiza nada.
  assert.ok(rota.indexOf("status: 304") < rota.indexOf("prisma.waContact.findMany"),
    "o portão precisa estar antes do trabalho pesado");

  const tela = ler("components", "portal", "portal-conversations.tsx");
  assert.match(tela, /"If-None-Match"/);
  assert.match(tela, /r\.status === 304/);
  assert.match(tela, /etagLista\.current = null/, "mudou o recorte, a impressão não vale mais");
});

test("o ETag entra na resposta cheia, senão não há o que devolver depois", () => {
  const rota = ler("app", "api", "portal", "[token]", "conversations", "route.ts");
  assert.match(rota, /headers: \{ ETag: etagAtual/);
});

test("a impressão leva em conta quem pergunta", () => {
  // Duas gerentes veem números diferentes. Sem a identidade no hash, uma
  // receberia 304 sobre a lista da outra.
  const rota = ler("app", "api", "portal", "[token]", "conversations", "route.ts");
  const ident = rota.slice(rota.indexOf("const identidade"), rota.indexOf("const etagAtual"));
  for (const campo of ["portal.clientId", "portal.email", "idsVisiveis", "url.search"]) {
    assert.ok(ident.includes(campo), `identidade precisa incluir ${campo}`);
  }
});

test("If-None-Match com vários valores é aceito", () => {
  const etag = 'W/"abc123"';
  assert.equal(etagConfere('W/"outro", W/"abc123"', etag), true);
  assert.equal(etagConfere('W/"abc123"', etag), true);
  assert.equal(etagConfere('W/"outro"', etag), false);
  assert.equal(etagConfere(null, etag), false);
});

// ── Acabamento ───────────────────────────────────────────────────────────────

test("digitar no iPhone não dá zoom na página", () => {
  const css = ler("lib", "portal-theme.ts");
  assert.match(css, /font-size:16px!important/);
  assert.ok(/input:not\(\[type="file"\]\)[^{]*textarea\{font-size:16px!important\}/.test(css));
  assert.ok(!/select\{font-size:16px!important/.test(css), "select não dá zoom e ficaria apertado");
});

test("quem pediu menos animação é respeitado no portal inteiro", () => {
  const css = ler("lib", "portal-theme.ts");
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("foco por teclado é visível", () => {
  assert.match(ler("lib", "portal-theme.ts"), /:focus-visible\{outline:/);
});
