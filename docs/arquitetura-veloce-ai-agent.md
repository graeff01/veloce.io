# Veloce AI Agent — Arquitetura (estado atual)

Motor único, multi-tenant, configurável por cliente. Atende leads pelo WhatsApp **fora do
horário comercial**, qualifica, consulta conhecimento e **agenda visitas**. Nunca negocia,
nunca inventa, nunca decide sobre documentos. Modelo: **gpt-4o-mini** (conversa) + **Groq
Whisper** (transcrição de áudio) + **OpenAI embeddings** (RAG).

## Princípio central
> A IA não afirma fato de cabeça. Fato vem de **tool** (estoque/agenda) ou de **conhecimento
> recuperado (RAG)**. Sem fonte → não responde, escala. A segurança é **arquitetural**, não
> depende do modelo.

## Componentes (um motor, dois contextos)
```
WhatsApp Cloud API ──► webhook (app/api/whatsapp/webhook)
                          │  valida assinatura · dedup por waMessageId · grava WaMessage
                          ▼
                       scheduleAgentRun  (lib/ai-agent/scheduler) — debounce + lock por contato
                          ▼
                       maybeRespondWithAgent (lib/ai-agent/respond)
                          │  gatekeeper · idempotência · breaker de gasto · resolve mídia (áudio→texto)
                          ▼
                       runAgent (lib/ai-agent/orchestrator)  ◄── mode: "live" | "test"
                          │  memória + RAG → loop de tools → guardrail → disclosure → log
                          ▼
                       sendWithRetry (lib/whatsapp-send)  [só live]
```
- **mode="live"**: envia WhatsApp, grava visita/perfil, loga `AiInteraction`.
- **mode="test"** (Console): mesmo prompt/tools/guardrail/RAG; tools de escrita **simulam**;
  não envia, não loga; memória = transcript efêmero. Endpoint `POST /api/clients/[id]/ai/console`.

## Subsistemas
| Arquivo | Papel |
|---|---|
| `lib/openai.ts` | chat com tool-calling (gpt-4o-mini) + embeddings + cosseno (RAG) |
| `lib/ai-agent/gatekeeper.ts` | decide se a IA atua: kill-switch global, `status==="live"`, habilitada, **fora do horário** (no fuso do tenant) |
| `lib/ai-agent/orchestrator.ts` | o motor: memória, RAG, loop de tools (retry), guardrail, fallback, disclosure, log |
| `lib/ai-agent/tools.ts` | `buscar_estoque`, `consultar_disponibilidade`, `marcar_visita`, `atualizar_perfil`, `escalar_humano` |
| `lib/ai-agent/guardrail.ts` | regras de bloqueio **por vertical** (default automotivo) + override por tenant |
| `lib/ai-agent/limits.ts` | breaker global de gasto diário (`prismaUnscoped`) |
| `lib/ai-agent/scheduler.ts` | debounce + lock por contato (em memória — assume 1 instância) |
| `lib/ai-agent/respond.ts` | orquestra borda: gatekeeper, dedupe, mídia, envio, gravação da saída |
| `lib/whatsapp-send.ts` | envio de texto pela Cloud API (só pelo agente) |
| `lib/whatsapp-media.ts` | download de mídia com limites (mime/tamanho/timeout) — só áudio |
| `lib/transcribe.ts` | transcrição (Groq Whisper) |
| `lib/tz.ts` | conversão de fuso por tenant (relógio de parede ↔ instante) |
| `lib/visit-availability.ts` | slots/janelas/capacidade (agendamento) |
| `lib/prisma.ts` | client + **guard de isolamento multi-tenant** (`$extends`) |

## Banco de dados (modelos do agente)
- **AiAgentConfig** (1/cliente): `enabled`, `status` (draft/test/live), `vertical`, `blockedTopics`,
  `audioTranscription`, `persona`, `goals`, `rules`, `businessHours`, `timezone`, `language`,
  `fallbackMessage`, `handoffAfter`, `model`.
- **CatalogItem**: catálogo genérico (multi-segmento) — única fonte de produto/preço.
- **KnowledgeChunk**: FAQ/políticas + `embedding` (RAG por cosseno no app).
- **LeadProfile**: qualificação (productInterest/budget/tradeIn/financing/score).
- **AiInteraction** (log por turno): `inbound`, `outbound`, `toolCalls`, `decision`, `model`,
  tokens, `latencyMs`, `status`, **`promptVersion`**, **`contextUsed`** (RAG), **`idempotencyKey`**,
  **`inboundMediaType`**.
- **VisitConfig** + **Visit**: janelas/capacidade/fuso e as visitas agendadas.

## Multi-tenant
- Tudo escopado por `clientId`. **Isolamento forçado**: `lib/prisma.ts` bloqueia
  find/count/aggregate/groupBy/updateMany/deleteMany sem `clientId` nos modelos tenant-owned.
  Query global legítima usa `prismaUnscoped` (exceção documentada: breaker de gasto).
- **Vertical**: `AiAgentConfig.vertical` define o conjunto de guardrail padrão; cliente pode
  sobrescrever via `blockedTopics`. Default `automotivo`. Novos segmentos = nova entrada no mapa,
  zero código no motor.

## Garantias da fundação (N1 + Pré-N2)
Timezone por tenant em toda a agenda · debounce+lock anti-duplicidade · booking serializable
(anti double-book) · retry+fallback (nunca silêncio) · kill-switch + caps de custo · disclosure
de atendimento automático · escalonamento por regra (`handoffAfter`) · isolamento multi-tenant
forçado · guardrail por vertical · migrações como fonte única · `promptVersion`+`contextUsed`
(rastreabilidade) · `idempotencyKey` (contrato p/ fila do N2).

## Fora de escopo (deliberado)
Visão/OCR/análise de documentos · negociação/financiamento/avaliação de troca · fila durável,
metering/quota por tenant, alerting (são **N2**).
