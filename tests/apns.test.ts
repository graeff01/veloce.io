import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync, createPrivateKey } from "node:crypto";
import { buildApnsBody, buildApnsJwt, derToJose, isDeadToken, apnsConfig } from "@/lib/notifications/apns";

// ── Transporte APNs ───────────────────────────────────────────────────────────
// O envio em si depende da Apple e de aparelho real. O que É verificável aqui —
// e é onde mora o erro clássico que faz a Apple devolver 403 sem explicação — é a
// assinatura ES256: o Node assina em DER, e o JOSE exige r||s de 32 bytes.

function parEC() {
  return generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

test("buildApnsJwt: gera JWT com header e claims corretos", () => {
  const { privateKey } = parEC();
  const jwt = buildApnsJwt({ keyId: "ABC123DEFG", teamId: "TEAM123456" }, createPrivateKey(privateKey), 1_700_000_000);
  const [h, c, s] = jwt.split(".");
  assert.ok(h && c && s);

  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "ABC123DEFG");
  assert.equal(header.typ, "JWT");

  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.iss, "TEAM123456");
  assert.equal(claims.iat, 1_700_000_000);
});

test("buildApnsJwt: a assinatura VERIFICA com a chave pública", () => {
  const { privateKey, publicKey } = parEC();
  const jwt = buildApnsJwt({ keyId: "K", teamId: "T" }, createPrivateKey(privateKey));
  const [h, c, s] = jwt.split(".");

  // Volta de JOSE (r||s) para DER para o verificador do Node.
  const sig = Buffer.from(s!, "base64url");
  assert.equal(sig.length, 64, "ES256 exige exatamente 64 bytes");

  const toDerInt = (b: Buffer): Buffer => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const trimmed = b.subarray(i);
    const precisaPad = (trimmed[0]! & 0x80) !== 0;
    const corpo = precisaPad ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed;
    return Buffer.concat([Buffer.from([0x02, corpo.length]), corpo]);
  };
  const r = toDerInt(sig.subarray(0, 32));
  const sPart = toDerInt(sig.subarray(32));
  const der = Buffer.concat([Buffer.from([0x30, r.length + sPart.length]), r, sPart]);

  const ok = createVerify("SHA256").update(`${h}.${c}`).verify(publicKey, der);
  assert.equal(ok, true, "JWT assinado incorretamente seria rejeitado pela Apple com 403");
});

test("derToJose: sempre 64 bytes, mesmo com componentes curtos", () => {
  const { privateKey } = parEC();
  const key = createPrivateKey(privateKey);
  // Várias assinaturas: r e s variam de tamanho e às vezes trazem o byte de sinal.
  for (let i = 0; i < 40; i++) {
    const jwt = buildApnsJwt({ keyId: "K", teamId: "T" }, key, 1_700_000_000 + i);
    const sig = Buffer.from(jwt.split(".")[2]!, "base64url");
    assert.equal(sig.length, 64, `assinatura ${i} com tamanho errado`);
  }
});

test("derToJose: recusa entrada que não é DER", () => {
  assert.throws(() => derToJose(Buffer.from([0x01, 0x02, 0x03])));
});

// ── payload ───────────────────────────────────────────────────────────────────

test("buildApnsBody: monta o aps com título, corpo e rota do deep link", () => {
  const body = buildApnsBody({ title: "🔥 Lead quer fechar", body: "João aprovou.", route: "conversas/abc123" });
  const aps = (body as { aps: { alert: { title: string; body: string }; sound: string } }).aps;
  assert.equal(aps.alert.title, "🔥 Lead quer fechar");
  assert.equal(aps.alert.body, "João aprovou.");
  assert.equal(aps.sound, "default");
  assert.equal((body as { route: string }).route, "conversas/abc123");
});

test("buildApnsBody: sem rota, cai em conversas (a tela principal)", () => {
  assert.equal((buildApnsBody({ title: "t", body: "b" }) as { route: string }).route, "conversas");
});

test("buildApnsBody: badge só aparece quando informado", () => {
  const sem = buildApnsBody({ title: "t", body: "b" }) as { aps: Record<string, unknown> };
  assert.equal("badge" in sem.aps, false);
  const com = buildApnsBody({ title: "t", body: "b", badge: 3 }) as { aps: { badge: number } };
  assert.equal(com.aps.badge, 3);
});

// ── higiene da base de aparelhos ──────────────────────────────────────────────

test("isDeadToken: reconhece aparelho que não existe mais", () => {
  assert.equal(isDeadToken("Unregistered", 410), true);
  assert.equal(isDeadToken("BadDeviceToken", 400), true);
  assert.equal(isDeadToken("DeviceTokenNotForTopic", 400), true);
  assert.equal(isDeadToken(undefined, 410), true);
});

test("isDeadToken: falha transitória NÃO apaga o aparelho", () => {
  assert.equal(isDeadToken("TooManyRequests", 429), false);
  assert.equal(isDeadToken("InternalServerError", 500), false);
  assert.equal(isDeadToken(undefined, 503), false);
});

// ── desligado por padrão ──────────────────────────────────────────────────────

test("sem APNS_* configurado, o push mobile está desligado", () => {
  const salvo = { ...process.env };
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_PRIVATE_KEY;
  assert.equal(apnsConfig(), null, "sem credencial o recurso não pode ficar meio ligado");
  process.env = salvo;
});

test("configuração parcial também conta como desligado", () => {
  const salvo = { ...process.env };
  process.env.APNS_KEY_ID = "K";
  process.env.APNS_TEAM_ID = "T";
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_PRIVATE_KEY;
  assert.equal(apnsConfig(), null);
  process.env = salvo;
});

// ── Notificação de mensagem nova ──────────────────────────────────────────────
// Sem `category` o iOS mostra a notificação SEM botões, e o "Responder" da tela
// de bloqueio — a razão de o app existir em vez do PWA — simplesmente não
// aparece. É silencioso: nada falha, o botão só não vem.

test("buildApnsBody: a categoria habilita os botões e só aparece quando pedida", () => {
  const com = buildApnsBody({ title: "t", body: "b", category: "mensagem" }) as { aps: Record<string, unknown> };
  assert.equal(com.aps.category, "mensagem");
  const sem = buildApnsBody({ title: "t", body: "b" }) as { aps: Record<string, unknown> };
  assert.equal("category" in sem.aps, false);
});

test("buildApnsBody: o contactId viaja para o app responder pela notificação", () => {
  const com = buildApnsBody({ title: "t", body: "b", contactId: "abc123" }) as Record<string, unknown>;
  assert.equal(com.contactId, "abc123");
  assert.equal("contactId" in (buildApnsBody({ title: "t", body: "b" }) as Record<string, unknown>), false);
});
