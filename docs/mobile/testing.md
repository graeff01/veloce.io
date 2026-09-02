# App iOS — testes

Sem ferramenta nova: `tsx --test` (node:test) já era do projeto. As duas suítes
rodam **sem banco, sem rede e sem simulador**.

## Comandos

```bash
# raiz (backend + web)
npx tsc --noEmit
npx tsx --test tests/**/*.test.ts

# app
cd apps/mobile
npx tsc --noEmit
npx tsx --test tests/*.test.ts
```

`node` vem do nvm (v22.x). Não há `.env` no projeto e nenhum teste toca banco.

## Linha de base

| | Antes | Depois |
|---|---|---|
| typecheck web | exit 0 | exit 0 |
| testes web | 278/280 | 307/309 |
| typecheck mobile | — | exit 0 |
| testes mobile | — | 58/58 |
| E2E contra backend real | — | 30/30 |

**As 2 falhas do web são pré-existentes e fora de escopo** —
`debounce.test.ts` (heurística do motor de IA mudou sem o teste acompanhar) e
`freight-resolve.test.ts`. Não foram tocadas: o escopo proíbe cleanup fora de
escopo. O alvo de qualquer mudança é manter exatamente essas duas.

## O que cada suíte cobre

**`tests/portal-mobile-auth.test.ts`** (18) — cookie vs Bearer, esquema forjado,
validação de aparelho, e a garantia de que o token de sessão nunca vai em claro
para `RateBucket.key`.

**`tests/apns.test.ts`** (11) — JWT ES256 com assinatura **verificada** com a
chave pública, DER→JOSE sempre 64 bytes, payload, limpeza de aparelho morto,
recurso desligado sem credencial.

**`apps/mobile/tests/core.test.ts`** (35) — trava de ambiente (dev não fala com
produção), erros 401/403/404/429, redaction, vínculo por link, contratos da API
(janela de 24h ausente = fechada).

**`apps/mobile/tests/client.test.ts`** (16) — Bearer em toda chamada, cookie
nunca, token do portal não persistido, 401 desloga uma vez, 403 não desloga,
rede caindo não desloga, logout limpa mesmo offline.

**`apps/mobile/tests/deep-link.test.ts`** (7) — payload de push é entrada
externa: rota desconhecida não navega, travessia de caminho recusada.

## Integração contra o backend REAL (30 testes)

`tests/e2e/portal-mobile.e2e.ts` — roda contra `next dev` + Postgres local.
Fora do glob de `npm test` de propósito: a suíte unitária continua hermética.

```bash
npm run dev          # terminal 1
npm run test:e2e     # terminal 2
```

Ver `docs/mobile/dev-local.md` para subir o banco.

- `portal-mobile.e2e.ts` (18): autenticação, sessão, isolamento entre tenants.
- `portal-contracts.e2e.ts` (12): os **parsers do app** rodando em cima do JSON
  real do servidor. É o que amarra os dois clientes — se o backend mudar de forma,
  quebra aqui, no CI, e não na tela da vendedora.

Cobre, contra o servidor de verdade:

- **PWA intacto**: login sem `device` seta cookie `HttpOnly` e **não** devolve
  token; cookie continua autenticando.
- **App**: login com `device` devolve token e **não** seta cookie; TTL de ~30
  dias (contra 60 do navegador).
- **Paridade**: cookie e Bearer devolvem a MESMA lista de conversas.
- **Isolamento entre tenants** — o cenário que motivou a arquitetura: o MESMO
  e-mail cadastrado em duas lojas; cada sessão enxerga só a sua. A senha de uma
  não entra na outra. Sessão da loja A não alcança contato da B (404). Bearer da
  A com o token da B na URL não vaza nada (401).
- **Credencial**: ausente → 401; inventada → 404; **revogada no servidor → para
  de funcionar na hora**; logout apaga a sessão daquele aparelho.
- **Branding**: `/me` devolve nome e cor do cliente certo.
- **Push**: `push/subscribe` grava o `DeviceToken`; token APNs malformado → 400.
- **`send`**: sem credencial → 401; com Bearer **atravessa a rota de checagem
  manual** e chega à validação de negócio (400 com texto vazio). É a prova de que
  as 22 rotas manuais funcionam sem terem sido editadas.

## Ainda não existe

- **E2E mobile** (Maestro): precisa do app rodando — logo, Xcode/simulador ou
  aparelho.
- **Envio APNs real**: precisa de conta Apple Developer e aparelho físico.
- **Envio real ao lead** (texto, mídia, áudio): exige `WaConnection` com token
  válido da Meta. Testamos até a borda: o `send` autentica e chega à validação de
  negócio, mas nada é enviado.

## Achados registrados durante a construção

1. **Contrato errado, pego pelo teste**: `Quote.number` é `Int` no banco, não
   texto. O parser do app devolveria `null` e a tela mostraria o orçamento sem
   número. Corrigido em `contracts.ts`.
2. **`setAssignment` devolve `ok:true` afetando zero linhas** quando o contato não
   tem `WaConversation` (`lib/ai-agent/respond.ts:539`, `updateMany`). Em produção
   todo contato com mensagem tem essa linha (criada no webhook), então não é
   alcançável hoje — mas o silêncio é frágil. **Não alterado: fora do escopo.**
3. **Proteção contra força bruta é real** e barrou a primeira versão da suíte.
4. **Espelho em memória do rate limit** curto-circuita antes do banco: limpar
   `RateBucket` não basta, é preciso reiniciar o servidor.
