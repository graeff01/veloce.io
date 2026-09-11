# Camada de segurança — o que foi implementado e como ligar

Complementa [`auditoria-seguranca-2026-08.md`](./auditoria-seguranca-2026-08.md) (diagnóstico) e
[`rfc-camada-seguranca-ia.md`](./rfc-camada-seguranca-ia.md) (desenho). Este é o guia operacional.

> **Estado atual do código: SEGURO POR PADRÃO e INERTE onde precisa de calibração.**
> As correções de autorização/rede estão **ativas**. Os controles de IA que podem alterar
> bytes vistos pelo modelo nascem em **shadow** (só observam) até você promovê-los.

---

## 1. Aplicar a migração (obrigatório)

```bash
npm run db:migrate     # aplica 20260804120000_ai_security_layer
```

Cria `AiSecurityEvent` (trilha) e `RateBucket` (contador de cota) e adiciona
`AiInteraction.turnId`. **Migração puramente aditiva** — nada existente é alterado.

O código funciona mesmo **antes** da migração: `emitSecurityEvent` cai para log em stdout e
o rate limit cai para o contador em memória. Nada quebra; você só perde a persistência.

---

## 2. Variáveis de ambiente

### Controle mestre da camada de IA

| Env | Padrão | Efeito |
|---|---|---|
| `AI_SECURITY_MODE` | `shadow` | `shadow` = detecta e registra, **não age** (turno byte-idêntico ao de hoje). `enforce` = aplica a política graduada. `off` = desliga tudo. |

**Comece em `shadow`.** Promova para `enforce` seguindo a seção 5.

### Já ativos (não dependem do modo)

| Env | Padrão | O que protege |
|---|---|---|
| `AI_LLM_TIMEOUT_MS` | `45000` | Timeout da chamada de chat da OpenAI |
| `AI_EMBED_TIMEOUT_MS` | `20000` | Timeout de embeddings |
| `AI_TURN_BUDGET_MS` | `90000` | Orçamento de tempo do turno inteiro |
| `AUTH_REVALIDATE_MS` | `60000` | Reconferência do usuário do painel no banco (revogação) |
| `SEC_WEBHOOK_MAX_BYTES` | `524288` | Corpo máximo do webhook |
| `SEC_WEBHOOK_MAX_PNIDS` | `8` | `phone_number_id` distintos por entrega |
| `CATALOG_SYNC_INSECURE_HOSTS` | `m.autocarro.com.br,...` | Únicos hosts com TLS relaxado no sync de catálogo |
| `SEC_TOOL_TIMEOUT_MS` | `12000` | Timeout padrão por ferramenta |
| `SEC_TOOL_DEDUPE_MS` | `60000` | Janela de idempotência de efeito externo |

### Cotas (todas com folga sobre o uso real)

| Env | Padrão | Janela |
|---|---|---|
| `SEC_RL_WEBHOOK_CONN` | 600 | 1 min, por conexão |
| `SEC_RL_INBOUND_CONTACT` | 40 | 10 min, por contato |
| `SEC_RL_TURNS_CONTACT_H` | 25 | 1 h, turnos de IA por contato |
| `SEC_RL_TURNS_CLIENT_H` | 600 | 1 h, turnos de IA por cliente |
| `SEC_RL_PORTAL` | 240 | 1 min, por token+IP |
| `SEC_RL_PORTAL_LLM` | 15 | 1 min, rotas que gastam modelo |
| `SEC_RL_STREAM` | 12 | 1 min, conexões SSE |
| `SEC_RL_LOGIN_ID` | 8 | 15 min, por identidade |
| `SEC_RL_LOGIN_IP` | 30 | 15 min, por IP |
| `SEC_RL_REGISTER_IP` | 5 | 1 h, por IP |

> As cotas do **portal** e do **webhook** só recusam quando `AI_SECURITY_MODE=enforce`.
> As de **login/registro** recusam **sempre** (é força bruta — não há motivo para observar).

### Outros

| Env | Padrão | Efeito |
|---|---|---|
| `PORTAL_SECTION_ENFORCE` | *(off)* | `1` aplica permissão por seção na API (hoje só registra) |
| `PORTAL_FIRST_USER_ADMIN` | *(off)* | `1` restaura o antigo "primeiro cadastro vira admin" |
| `SEC_CTX_MEMORY` / `_PERFIL` / `_KNOWLEDGE` / `_VEHICLE` | 1200/800/4000/400 | Tetos dos blocos de contexto |
| `AI_SEC_T_RIGOR` / `_RESTRICT` / `_CONTAIN` | 0.3 / 0.6 / 0.85 | Limiares da política graduada |

---

## 3. O que mudou de comportamento (leia antes de subir)

Três mudanças **intencionais** que alteram fluxo existente:

1. **Painéis com `requireLogin` ligado agora exigem sessão em 12 rotas que antes
   respondiam só com o link.** É a correção do achado A-01. Painéis com login
   **desligado** continuam funcionando exatamente como hoje.

2. **O primeiro auto-cadastro no portal não vira mais admin.** Quem foi convidado pela
   agência (linha em `PortalAccess` criada no painel interno) mantém o papel de lá; o
   auto-cadastro nasce `attendant`. **Se um cliente novo se cadastrar sozinho, promova-o
   pelo painel interno** (aba de acessos). `PORTAL_FIRST_USER_ADMIN=1` volta ao antigo.

3. **Usuário do painel interno desativado/excluído perde acesso em até 60 s** (antes
   durava até 8 h). Se algum fluxo dependia da sessão sobreviver à desativação, ele muda.

Tudo o mais é aditivo ou invisível.

---

## 4. O que fica em shadow (não age até você mandar)

Com `AI_SECURITY_MODE=shadow` (padrão), estes **calculam e registram, sem agir**:

- **C-05 detector de injeção** → grava score/rótulos em `AiSecurityEvent`
- **C-06 política graduada** → grava o perfil que *teria* aplicado
- **C-07 quarentena de memória** → aponta o resumo contaminado, mas grava/lê como hoje
- **C-08 tetos de contexto** → aponta o estouro, sem truncar
- **C-11 firewall de ferramentas** → registra violação de esquema/cota, mas executa com os
  args originais *(o timeout e o dedupe já valem sempre — são proteção de recurso)*
- **C-12 DLP de egress** → aponta o vazamento, sem trocar a resposta
- **A-04 permissão por seção** → aponta o acesso indevido, sem bloquear

---

## 5. Promoção shadow → enforce

Depois de **14 dias** e **≥1 000 turnos**:

```sql
-- Quanto o detector acionaria, por perfil
SELECT control, action, severity, count(*)
FROM "AiSecurityEvent" WHERE "createdAt" > now() - interval '14 days'
GROUP BY 1,2,3 ORDER BY 4 DESC;

-- Os 20 casos de maior score — revisão MANUAL obrigatória
SELECT "createdAt", control, score, labels, evidence
FROM "AiSecurityEvent" WHERE control = 'C-05'
ORDER BY score DESC LIMIT 20;

-- Falso-positivo do gate do portal (deve ser ~0 se a UI estiver correta)
SELECT count(*) FROM "AiSecurityEvent" WHERE control IN ('A-01','A-04');
```

**Critério de saída:** falso-positivo < 0,1%, zero divergência no replay
(`npx tsx scripts/sim-compare.ts`), goldens sem regressão (`npm run eval`).

Ordem sugerida: `PORTAL_SECTION_ENFORCE=1` → `AI_SECURITY_MODE=enforce` num cliente
canário (`testMode`) por uma semana → geral.

---

## 6. Verificação

```bash
npm run typecheck
npx tsx --test tests/security-*.test.ts tests/tool-firewall.test.ts tests/portal-guard.test.ts
npm run build
```

`tests/portal-guard.test.ts` é o guarda permanente: **rota nova em `/api/portal/**` sem
gate quebra o teste**. Foi assim que as 11 omissões nasceram — agora não nascem de novo.

---

## 7. O que ficou de fora (próxima onda)

- **C-14 motor de anomalia** (janela lenta / *low and slow*) — precisa da linha de base que
  o `AiSecurityEvent` está começando a coletar agora.
- **C-09 proveniência do RAG** e **C-10 higienização do corpus de Sales DNA**.
- **C-17 cofre de segredos** no `ToolCtx`.
- **Estado distribuído (Redis)** — o `RateBucket` já é do banco, mas os 6 controles legados
  em memória (semáforo, breaker, blocklist, tetos de gasto, anti-flood do painel) seguem
  por processo. **Bloqueante antes da segunda instância.**
- **Retenção do `AiSecurityEvent`** (sugerido: 90 dias).
