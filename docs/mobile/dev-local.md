# Ambiente local de desenvolvimento

Nada aqui toca produção. O `.env` é ignorado pelo git e aponta só para `127.0.0.1`.

## Postgres dedicado (porta 5433)

Cluster **próprio**, fora do padrão, para não encostar em nenhum banco local
existente. PostgreSQL 16 já estava instalado via Homebrew.

```bash
export LC_ALL=C   # sem isto o postmaster do macOS falha com "tornou-se multithread"

initdb -D ~/Downloads/veloce-devdb -U "$USER" --auth=trust -E UTF8
pg_ctl -D ~/Downloads/veloce-devdb \
  -o "-p 5433 -k /tmp -c listen_addresses=127.0.0.1" \
  -l ~/Downloads/veloce-devdb/server.log start
createdb -h 127.0.0.1 -p 5433 veloce_dev

# parar
pg_ctl -D ~/Downloads/veloce-devdb stop
```

## `.env` (local, nunca versionado)

```
DATABASE_URL="postgresql://<usuário>@127.0.0.1:5433/veloce_dev?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=<aleatório local>
ENCRYPTION_KEY=<aleatório local>
CRON_SECRET=<aleatório local>
AI_AGENT_KILL=1          # motor de IA desligado: nenhum job tenta responder lead
SEC_RL_LOGIN_IP=500      # tetos afrouxados SÓ aqui — ver "rate limit" abaixo
SEC_RL_LOGIN_ID=200
SEC_RL_PORTAL=5000
```

## Migrations

`npx prisma migrate deploy` aplica as **133** migrations do zero, incluindo
`ai_security_layer`, `portal_session_device` e `device_token`. Verificado.

`npm run db:check` acusa drift **pré-existente** (`CustomerPortalCredential`,
`PortalAccessLog`, `Role.CLIENT`, `Client.portalEnabled`) — o mesmo que
`docs/drift-cleanup-DRAFT.sql` documenta. Não tem relação com o app e não foi
tocado.

## Rodar

```bash
npm run dev                    # http://localhost:3000
npm run test:e2e               # 18 testes contra o backend real
npm test                       # suíte unitária: NÃO precisa de banco nem servidor
```

## Rate limit e o espelho em memória

`lib/ai-agent/security/quota.ts` mantém um contador em memória que
**curto-circuita antes de consultar o banco**. Consequência prática, descoberta
rodando a suíte: limpar `RateBucket` no banco **não** zera o contador do processo
do servidor — é preciso reiniciar o `next dev`.

Por isso a suíte E2E faz login HTTP apenas nos testes que são *sobre login*; os
de autorização criam a sessão pelo `createSession` do próprio backend. A primeira
versão fazia ~15 logins reais e os 5 últimos testes falhavam — corretamente, com
a proteção contra força bruta atuando (8 por identidade, 30 por IP em 15 min).
