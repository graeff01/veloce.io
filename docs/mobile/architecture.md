# App iOS do Portal do Cliente — decisões

Um backend, dois clientes. O PWA em `/r/<token>` continua igual; o app é um
segundo consumidor da mesma API. Só decisões não óbvias estão aqui.

---

## 1. Bearer entrou em `getPortalSessionEmail`, não no `guardPortal`

**Problema.** O app não guarda cookie `httpOnly`. Só 14 rotas do portal usam
`guardPortal`; as outras 22 fazem checagem manual — inclusive `send`,
`send-media` e `assign`. Adicionar Bearer só no gate deixaria o app lendo
conversas e sem conseguir responder.

**Decisão.** `readSessionToken()` (cookie → Bearer) dentro de
`getPortalSessionEmail`, que é o funil dos ~35 pontos de leitura de sessão.

**Motivo.** Uma função ganha suporte mobile em todas as rotas. A alternativa era
consolidar 22 rotas quentes em produção — a mudança de maior risco do projeto,
que o escopo mandou não fazer sem aprovação.

**Risco.** Qualquer rota futura que leia sessão por outro caminho fica fora.
Mitigado por `tests/portal-guard.test.ts`, que já exige gate em toda rota nova.

**Teste.** `tests/portal-mobile-auth.test.ts` — `bearerFromHeader` (esquema,
espaços, header forjado com espaço no meio).

---

## 2. `_session` no lugar do token na URL

**Problema.** Toda rota é `/api/portal/<token>/…`. Se o app não persiste o token
do portal (credencial sensível), não chama nada.

**Decisão.** `resolvePortal("_session")` resolve o tenant pela `PortalSession` do
Bearer. O token do portal é usado UMA vez, no login, e sai de escopo.

**Motivo.** Evita um segundo tree de rotas e mantém o token fora do aparelho.
Efeito colateral bom: rotacionar o token do portal não derruba o app.

**Risco.** O sentinela vira chave única de rate limit — resolvido em (3).

**Teste.** `apps/mobile/tests/client.test.ts` — "o token do PORTAL só aparece na
chamada de login e nunca é gravado".

---

## 3. Rate limit por hash da sessão

**Problema.** `guardPortal` monta a chave com `token.slice(0,24)|ip`. Com
`_session`, todos os aparelhos dividiriam um balde de 240/min.

**Decisão.** `rateIdentity()`: token do portal no web (sem mudança), hash SHA-256
do token de sessão no app.

**Motivo.** Hash e não prefixo porque `RateBucket.key` é persistido — gravar 24
dos 32 caracteres do segredo seria vazamento.

**Risco.** Cada requisição do portal já era um `upsert` no Postgres; o app soma
escrita no mesmo caminho. Por isso o app é push-driven, sem polling.

**Teste.** `tests/portal-mobile-auth.test.ts` — "o token de sessão NUNCA aparece
em claro na chave".

---

## 4. Sessão de aparelho: 30 dias e revogável

**Problema.** A sessão do portal dura 60 dias e `PortalSession` não sabe de qual
aparelho é. Celular perdido só saía derrubando todas as sessões do e-mail.

**Decisão.** `deviceId`/`deviceName`/`devicePlatform` em `PortalSession`, TTL de
30 dias quando há `device`. Sem `device`, comportamento do navegador intacto.

**Motivo.** Credencial longa num aparelho físico tem risco que o cookie não tem.

**Risco.** Migration nova numa cadeia com drift conhecido. Mitigado: aditiva,
idempotente, colunas anuláveis.

**Teste.** `parseDevice` em `tests/portal-mobile-auth.test.ts` (id, plataforma,
truncamento de nome).

---

## 5. Dois transportes de push, uma decisão

**Problema.** Web Push (VAPID) não serve para app nativo.

**Decisão.** `sendPushToPortalDevices` ao lado de `sendPushToPortalClient`, com a
mesma assinatura. `portal-push.ts` chama os dois; o QUE dispara não mudou.

**Motivo.** A regra de negócio da notificação (inclusive "só a dona da conversa")
fica em um lugar só.

**Risco.** O envio APNs nunca foi exercitado contra a Apple. Sem `APNS_*` o ramo
sai na primeira linha — desligado é o padrão.

**Teste.** `tests/apns.test.ts` — a assinatura ES256 é verificada com a chave
pública (o erro DER→JOSE é o que gera 403 sem explicação).

---

## 6. UI nova, não portada

**Problema.** `portal-conversations.tsx` tem 75 KB e 161 blocos de estilo inline.

**Decisão.** Reproduzir comportamento e contratos; escrever a UI do zero.

**Motivo.** Estilo inline de React DOM não é React Native. "Reusar a UI" só seria
possível dentro de uma WebView — o que a análise descartou.

**Risco.** Divergência de comportamento entre os dois clientes ao longo do tempo.
Mitigado pelos parsers de contrato, que quebram no CI se a API mudar.

---

## 7. Sem CORS

Cliente nativo não aplica same-origin: CORS é mecanismo de navegador. O site
segue 100% same-origin e o cookie `sameSite=lax` continua protegendo o PWA;
Bearer é imune a CSRF por construção. **Se alguém propuser Expo Web ou WebView,
esta decisão precisa ser revista.**
