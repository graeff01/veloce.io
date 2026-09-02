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

## Ainda não existe

- **E2E mobile** (Maestro): precisa de app rodando — logo, de Xcode/simulador ou
  aparelho. Fase seguinte.
- **Teste de integração contra o backend de verdade**: precisa de um ambiente
  local com banco. Não há `.env` nem Postgres nesta máquina, e usar produção é
  proibido.
- **Envio APNs real**: precisa de conta Apple Developer e aparelho físico.
