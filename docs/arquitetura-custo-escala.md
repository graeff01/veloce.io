# RFC — Arquitetura de execução para escala (custo sublinear)

**Objetivo:** preparar o Veloce AI Agent para 5k → 100k+ leads/mês mantendo **100% do comportamento atual** (mesmo roteiro, mesmas perguntas, mesmos vídeos/PDFs/orçamentos/preços, mesmo DNA, mesmo tom). Muda a **arquitetura de execução**, não o atendimento.

**Regra de ouro deste RFC:** nenhuma mudança pode alterar o texto que o cliente recebe. Toda proposta abaixo muda *quando* e *o que* é carregado no contexto — nunca *o conteúdo* do que já está aprovado. A prova disso é um harness de regressão (Fase 0) que roda ANTES de cada mudança ir a produção.

---

## 0. Princípio arquitetural central (leia antes de tudo)

O custo por lead tem dois fatores multiplicativos:

```
custo_por_lead  =  (nº de chamadas ao modelo por lead)  ×  (tokens por chamada)  ×  (preço por token)
```

Otimizar **tokens por chamada** tem **piso**: o prefixo estável já é cacheado (a OpenAI cobra 50% no `gpt-4o-mini` — `cachedIn` $0.075 vs `in` $0.15/1M). Cortar 2k tokens de um prefixo que já é cacheado economiza ~$0.00015/chamada. Pouco.

Otimizar **nº de chamadas ao modelo por lead** NÃO tem piso e é onde o custo explode com volume. Hoje, **uma única mensagem de lead** dispara:

- 1 a 5 chamadas do chat principal (loop de tools — cada iteração reenvia o contexto inteiro);
- \+ 4 chamadas assíncronas (intelligence, qualify-extract, funnel-llm, evaluation amostrada);
- \+ 1 embedding (RAG).

**Portanto a tese deste RFC é: a alavanca de escala é reduzir o número de chamadas por lead, não emagrecer um prefixo já cacheado.** As duas coisas serão feitas, mas nesta ordem de prioridade.

---

## 1. Baseline medido (fatos, não estimativas)

### 1.1 Prompt estável (`buildStablePrompt`) — automotivo padrão

| Bloco | Tokens | Sempre carregado? |
|---|---:|---|
| Identidade + OBJETIVO | ~150 | sim |
| VOZ (como escreve) | 859 | sim |
| LIMITES (o que pode/não pode) | 1.026 | sim |
| COMO CONDUZIR | 1.060 | sim |
| PERGUNTAS FREQUENTES (casuística) | 1.446 | sim |
| **Total prompt estável** | **~4.500** | |

> Clientes com `customPrompt` (ex.: JR) substituem esse bloco pelo prompt próprio; o restante (tools, dinâmico, orçamento) é idêntico.

### 1.2 Schemas de tools (sempre reenviados por chamada)

| Tool | Tokens | Estágio típico |
|---|---:|---|
| buscar_estoque | 201 | produto |
| atualizar_perfil | 498 | todos |
| enviar_foto | 187 | produto |
| escalar_humano | 152 | negociação |
| reagir | 164 | todos |
| enviar_localizacao_loja | 123 | fechamento |
| atualizar_ficha | 119 | orçamento |
| gerar_orcamento | 367 | orçamento |
| enviar_orcamento | 87 | orçamento |
| aprovar_orcamento | 120 | fechamento |
| enviar_video | 104 | abertura |
| enviar_catalogo | 213 | produto |
| pedir_localizacao | 183 | orçamento |
| enviar_opcionais | 300 | produto |
| **Total (cliente com orçamento)** | **~2.600** | |

### 1.3 Contexto dinâmico

| Bloco | Tokens | Presença |
|---|---:|---|
| QUALIFICAÇÃO (slots+score+regras) | ~610 | sempre |
| firstNote (roteiro de abertura) | ~320 | só 1ª msg |
| CONHECIMENTO (RAG top-3) | 300–600 | quase sempre |
| MEMÓRIA rolante | ~180 | se existir |
| PERFIL | ~120 | se existir |
| VEÍCULO DE INTERESSE | ~80 | lead de anúncio |
| data/hora + status loja | ~120 | sempre |
| quoteGuidance (ficha + tabela de preços) | 300–800 | se quotesEnabled |
| salesDna | ~900 | se salesDnaEnabled |
| Histórico (janela podada) | ≤1.200 | sempre |

**Total típico de input por chamada: ~9.000–11.000 tokens.** Confirma a observação dos "10 mil".

### 1.4 Modelo de custo (preços reais em `lib/ai-agent/usage.ts`)

`gpt-4o-mini`: in **$0.15**/1M · cached **$0.075**/1M · out **$0.60**/1M.

Custo estimado de **uma mensagem de lead** que dispara 1 tool + resposta final (2 round-trips) + os 4 assíncronos:

| Componente | Chamadas | Input aprox | Custo aprox |
|---|---:|---:|---:|
| Chat principal (2 round-trips) | 2 | ~10k + ~10,4k | ~$0.0021 |
| intelligence | 1 | ~1k | ~$0.0002 |
| qualify-extract | 1 | ~1,5k | ~$0.0004 |
| funnel-llm | 1 | ~1,5k | ~$0.0004 |
| evaluation (amostrada) | ~0,1 | ~2k | ~$0.0001 |
| embedding RAG | 1 | — | ~$0.000001 |
| **Total / mensagem** | | | **~$0.0032** |

> Números modelados. **Calibre com o real:** `costBreakdown()` e `windowCost()` já devolvem `costPerLead` e custo por pipeline por cliente — é a fonte de verdade. Ver Fase 0.

### 1.5 Projeção (assumindo ~6 mensagens de lead por conversa; calibrar com `costPerLead` real)

| Volume/mês | Custo hoje (~$0.02/lead) | Custo alvo (~$0.006/lead) |
|---:|---:|---:|
| 1.600 | ~$32 | ~$10 |
| 10.000 | ~$200 | ~$60 |
| 50.000 | ~$1.000 | ~$300 |
| 100.000 | ~$2.000 | ~$600 |

Alvo = **~70% de redução de custo por lead** sem tocar no comportamento. O grosso vem de (a) menos chamadas assíncronas, (b) fast-path/roteamento e (c) menos round-trips do loop de tools — não de cortar o prefixo.

---

## 1.6 Baseline REAL medido em produção (2026-07-24) — supersede §1.4/§1.5

As seções 1.4/1.5 eram **modeladas**. Rodei `scripts/cost-report.ts` contra produção (30 dias). Os números reais corrigem duas premissas e **reordenam a prioridade**:

| Métrica | Agregado | Boqueirão (256 leads) | JR (12 leads) |
|---|---:|---:|---:|
| Custo/lead | **$0.027** | **$0.020** | $0.173* |
| Chamadas de chat/lead | 7.93 | 6.66 | 35* |
| Tokens in / chamada chat | 7.348 | 6.597 | 10.378 |
| Cache hit-rate (chat) | **1.1%** | 1.5% | 0% |

\* JR é amostra pequena (12 leads, muitos de teste); Boqueirão é o número representativo.

**Distribuição de custo por pipeline (o achado #1):**

| Pipeline | Custo | % | Chamadas |
|---|---:|---:|---:|
| **chat** | $6.35 | **87.8%** | 2.126 |
| intelligence | $0.86 | 11.9% | 5.635 |
| judge/memory/embedding | $0.03 | 0.3% | 1.558 |

### Correção 1 — o custo é 88% chat, não distribuído
Consolidar os assíncronos (Fase 1) economiza **~12% de custo, não ~25%**. **Mas** reduz 5.635 → ~851 chamadas `intelligence` (6.6/turno → 1/turno): isso importa por **resiliência/rate-limit/latência na escala**, não por custo. Fase 1 continua primeira — pelo baixo risco e por alimentar o Middleware — com a justificativa recalibrada.

### Correção 2 — o cache NÃO está descontando o prefixo (1.1%, não ~50%)
Diagnóstico: o mecanismo **funciona** (quando acerta, cacheia ~5.932 de 7.348 tokens ≈ 80%), mas acerta em **1.4%** das chamadas. Causa: **volume/TTL** — ~100 chamadas/dia espalhadas, e o cache da OpenAI expira em ~5-10 min de inatividade. **É artefato de baixo volume que se auto-corrige na escala** (a 100k leads/mês a densidade de chamadas sobe e o hit-rate tende ao teto de ~80%).

**Implicação estratégica (reordena o roadmap):**
1. **Reduzir chamadas de chat/lead** (round-trips: Composite Hydration) — sempre vale, ataca os 88%. **Subiu de prioridade.**
2. **Reduzir os tokens DINÂMICOS não-cacheáveis** por chamada — `quoteGuidance`/`salesDna`/histórico são recompostos a cada turno e pagam preço cheio **sempre** (o cache só pega o prefixo estável). Lazy loading disso (Fase 2) vale em qualquer volume. **Subiu de prioridade.** Evidência: **JR carrega `quoteGuidance` em 65% de turnos que não usam nenhuma tool de orçamento** — desperdício direto.
3. **Encolher o prefixo estável** (Fase 6) — prioridade **menor** na escala (o cache o desconta a ~80%); ajuda só no baixo volume atual e na 1ª chamada de cada conversa.
4. **Cache-friendliness estrutural** — garantir prefixo byte-estável (o Prompt Compiler já mira isso) para colher o auto-benefício na escala.

O alvo de ~70% se mantém, mas o **caminho** muda: menos "cortar prefixo", mais "menos round-trips + menos tokens dinâmicos por chamada".

---

## 2. Arquitetura alvo (visão)

```
                 ┌──────────────────────────────────────────────┐
   WhatsApp ───► │ Webhook (grava + enfileira)  [inalterado]     │
                 └───────────────┬──────────────────────────────┘
                                 ▼
                 ┌──────────────────────────────────────────────┐
                 │ Fila durável (debounce/coalesce) [inalterado] │
                 └───────────────┬──────────────────────────────┘
                                 ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ (A) PRÉ-ROTEADOR determinístico  ← NOVO                              │
   │     opt-out · blocklist · gatekeeper (já existem)                    │
   │     \+ classificação barata de TURNO: trivial-ack? conteúdo? handoff?│
   └───────────┬───────────────────────────────┬─────────────────────────┘
     trivial   │                     conteúdo   │
   (ack/emoji) ▼                                ▼
   ┌────────────────────┐        ┌────────────────────────────────────────┐
   │ (B) FAST PATH      │        │ (C) MOTOR PRINCIPAL (state-driven) ←NOVO│
   │  cheap-tier/no-op  │        │  Conversation State → seleciona:        │
   │  (sem chat grande) │        │   • tools do estágio                     │
   └────────────────────┘        │   • blocos de conhecimento do estágio    │
                                 │   • prompt núcleo + módulos lazy         │
                                 │  loop de tools com paralelismo           │
                                 └───────────────┬────────────────────────┘
                                                 ▼
                 ┌──────────────────────────────────────────────┐
                 │ (D) PÓS-ENVIO consolidado  ← NOVO             │
                 │  1 chamada (intent+perfil+funil) em vez de 3-4│
                 └──────────────────────────────────────────────┘
```

Nada em maiúsculas "NOVO" altera o texto entregue ao cliente — muda o *caminho de execução* e *o que entra no contexto*.

---

## 3. Conversation State (Princípio 7) — o coração da mudança

### 3.1 Ideia

Um estado explícito por conversa (`WaConversation.agentState`) que é uma **função determinística** do que já se sabe do lead. O estado NÃO decide o que a IA diz — decide o que é **carregado** para ela poder dizer. É uma tabela de roteamento de contexto, não uma máquina de diálogo.

```
saudacao → conhecendo → identificando_produto → orcamento → negociacao → fechamento
```

Transições derivadas de sinais que já existem: `LeadProfile` (slots preenchidos), `funnelStage`, tools chamadas, presença de `Quote`. Já temos `slotState()`, `scoreLead()`, `funnelStage` e o classificador de funil — o estado é uma projeção disso, não um sistema novo de IA.

### 3.2 Mapa estado → contexto (preservando comportamento)

| Estado | Tools expostas | Conhecimento carregado | Blocos de prompt |
|---|---|---|---|
| saudacao | atualizar_perfil, buscar_estoque, enviar_foto, enviar_video, reagir | veículo de interesse (se anúncio) | núcleo + firstNote |
| conhecendo | \+ escalar_humano | RAG sob demanda | núcleo + qualificação |
| identificando_produto | \+ enviar_catalogo, enviar_opcionais | RAG + estoque (tool) | núcleo + qualificação |
| orcamento | atualizar_ficha, gerar_orcamento, enviar_orcamento, pedir_localizacao, buscar_estoque | quoteGuidance + tabela de preços | núcleo + fluxo de orçamento |
| negociacao/fechamento | escalar_humano, aprovar_orcamento, enviar_localizacao_loja | — | núcleo + handoff |

**Garantia de não-regressão (crítica):** o conjunto de tools por estágio é sempre um **superconjunto do que o modelo usaria naquele ponto**. Se houver *qualquer* ambiguidade sobre o estágio, o roteador cai no **modo pleno** (todas as tools, como hoje). O default seguro é o comportamento atual; a economia só é aplicada quando o estágio é inequívoco. Isso torna a mudança **monotônica em segurança**: no pior caso, custa o mesmo que hoje; nunca degrada.

### 3.3 Cuidado com prompt caching ao gatear tools

O prompt cache da OpenAI casa o **prefixo mais longo** de `tools` + `messages`. Se o conjunto de tools muda por estágio, o cache da porção de tools é invalidado naquela divergência. Mitigação:

- Ordenar as tools de forma **estável e crescente por estágio** (as comuns primeiro: `atualizar_perfil`, `buscar_estoque`, `reagir`; as de estágio depois). Assim o prefixo comum de tools continua cacheável entre estágios.
- **Medir `cachedTokens` antes/depois** (já logado). Se o hit-rate cair mais do que a economia de tokens brutos compensa, manter as tools estáveis e gatear só conhecimento/prompt. Decisão guiada por dado, não por fé.

---

## 4. Conhecimento lazy (Princípios 1, 2, 6)

### 4.1 O que sai do prefixo estável

Hoje o bloco **PERGUNTAS FREQUENTES (~1.446 tokens)** é casuística que quase nunca se aplica ao turno (Ka hatch×sedan, "lead de longe", "várias unidades"…). Proposta: mover essa casuística para `KnowledgeChunk` (a base de RAG que já existe) e recuperá-la **só quando a mensagem casa**. O núcleo do prompt (VOZ + LIMITES + fluxo) permanece sempre.

- **Preserva comportamento?** Sim — o texto das regras é o mesmo; muda de "sempre colado" para "recuperado quando relevante". Risco: uma regra deixar de ser recuperada quando deveria. Mitigação: (a) manter no núcleo as regras de **segurança/veracidade/handoff** (nunca lazy); (b) só tornar lazy a casuística de produto; (c) golden eval cobrindo cada caso de FAQ antes do rollout.
- **Ganho:** prompt estável 4.500 → ~2.500 tokens. Como é prefixo cacheado, o ganho direto é modesto (~$0.00015/chamada), mas reduz o custo do **primeiro** hit de cada conversa (não cacheado) e o custo das chamadas do loop de tools que reenviam tudo.

### 4.2 quoteGuidance e tabela de preços

Hoje, se `quotesEnabled`, a **tabela de preços inteira** vai no prompt em todo turno, mesmo num "oi". Proposta: carregar `quoteGuidance` + tabela **só nos estados `orcamento`/`fechamento`** (via Conversation State). Nos estados iniciais, o preço continua acessível via `buscar_estoque`/`gerar_orcamento` (tools) — comportamento idêntico, porque o preço já é sempre servido por tool, nunca "de cabeça".

- **Ganho:** −300 a −800 tokens em toda mensagem que não é de orçamento (a maioria).

### 4.3 salesDna

~900 tokens sempre que ligado. Ele influencia **como fecha/contorna objeção** — relevante nos estados médios/finais, quase inútil na saudação. Carregar de `conhecendo` em diante. Preserva comportamento (o DNA já não muda a abertura, que segue o firstNote).

---

## 5. Fast Path e roteamento de modelo (Princípio 4)

**Atenção à armadilha de regressão:** hoje um "oi" no **primeiro contato** NÃO é trivial — dispara o roteiro de abertura (saudação fixa + foto do anúncio + ano/km/preço). Um fast-path ingênuo que responde "oi" com template **mudaria o comportamento**. Então:

1. **No-op já determinístico (zero risco):** opt-out e blocklist já cortam antes do modelo. Estender o gate para casos onde a IA hoje **já não agrega** (ex.: em `autoMode`, acks triviais que já retornam `[SKIP]`). Não é resposta nova — é não-chamar o modelo quando o resultado atual já é "não responder".
2. **Trivial-ack em conversa em andamento:** "ok", "obrigado", "👍" no meio da conversa. Hoje isso gera um turno completo de ~10k tokens para produzir um fechamento curto. Proposta: rota **cheap-tier** — mesma persona, contexto mínimo (núcleo + últimas 2 msgs, sem RAG/tools de orçamento). A resposta continua vinda do modelo (mantém tom), mas a ~1/5 do custo. **Nunca** template fixo.
3. **Cache semântico de FAQ pura:** "qual o horário?", "onde fica?" repetem milhares de vezes com resposta idêntica por cliente. Cachear (embedding da pergunta → resposta **previamente gerada e aprovada** naquele tom). Preserva o tom porque a resposta cacheada foi produzida pela própria IA. Só ativa acima de um limiar de similaridade alto; abaixo dele, vai ao modelo normal.

**Regra de segurança do fast-path:** só encurta quando consegue **provar equivalência** (caso já determinístico, ou resposta previamente aprovada). Na dúvida → motor principal. Novamente monotônico: no pior caso, custo de hoje.

---

## 6. Redução do loop de tools (Princípio 5)

- **Tool calls paralelas num turno:** o modelo já pode emitir múltiplas `tool_calls` numa iteração; o executor (`executeTool`) roda em sequência mas pode rodar em `Promise.all`. Encorajar (via prompt do núcleo, sem mudar comportamento visível) buscar_estoque + enviar_foto juntas evita 1 round-trip. Cada round-trip evitado = ~10k tokens de input a menos.
- **Anti-rebusca (já parcialmente no prompt):** "se já buscou, use os dados". Reforçar deterministicamente cacheando o resultado de `buscar_estoque` no `ToolCtx` do turno para não re-consultar o mesmo termo.
- **Teto de iterações por custo:** hoje o loop é de 5. Medir a distribuição real de iterações (logável) — se p95 = 2, reduzir o teto para 3 corta cauda cara sem afetar o caminho feliz.

**Ganho:** o maior em custo por mensagem de conteúdo — cada round-trip a menos economiza um contexto inteiro (~$0.001).

---

## 7. Pós-envio consolidado (a maior economia isolada)

Hoje, por mensagem: `intelligence` + `qualify-extract` + `funnel-llm` + `evaluation` = **3-4 chamadas LLM extras**. Intent, sentiment, objeção, extração de perfil e etapa de funil podem ser produzidos por **uma única chamada** `gpt-4o-mini` que retorna um JSON combinado (todas as taxonomias já são fechadas e validadas).

- **Preserva comportamento?** Sim — essas rotinas **não geram texto para o cliente**; alimentam ficha/funil/analytics. Consolidar muda a plumbing, não a saída ao lead.
- **Ganho:** de ~4 chamadas → 1. ~$0.0008/mensagem. Em 100k leads × 6 msgs = **~$480/mês** só aqui.
- **Manter `evaluation` amostrada** (já é `shouldSample`) — não precisa ser todo turno.

---

## 8. Fase 0 — Medir e blindar (Princípio 8), obrigatória antes de qualquer mudança

Tudo abaixo usa tabelas **que já existem** (`AiUsage`, `AiInteraction` com `tokensIn/tokensOut/cachedTokens/stages/contextUsed/decision`). Não altera comportamento.

1. **Relatório de decomposição de custo** (script novo, read-only):
   - custo por pipeline (chat/intelligence/memory/judge/embedding) — já via `costBreakdown()`;
   - `costPerLead` real por cliente — já via `windowCost()`;
   - distribuição de **iterações do loop de tools** por mensagem (de `AiInteraction.toolCalls`);
   - **hit-rate do prompt cache** = `sum(cachedTokens)/sum(tokensIn)` do pipeline `chat`;
   - histograma de **tipo de turno** (trivial-ack vs conteúdo vs handoff) para dimensionar o fast-path;
   - % de mensagens que carregaram quoteGuidance/salesDna sem estar em estado de orçamento (desperdício direto).
2. **Golden set de regressão** (a infra já existe: `evals/`, `scripts/run-evals.ts`, `scripts/harvest-goldens.ts`, `scripts/score-production.ts`): colher N conversas reais representativas por vertical e congelar as respostas atuais como referência. **Critério de aceite de qualquer PR deste RFC: diff comportamental ≈ 0 no golden set** (mesma decisão de tool, mesma presença de foto/PDF/vídeo, similaridade textual alta). É isto que garante "o cliente não percebe diferença".
3. **Flags de rollout gradual:** cada mudança atrás de um flag por cliente (`agentState`, `lazyKnowledge`, `stagedTools`, `fastPath`, `consolidatedPostSend`), começando em `testMode`/canário, depois 1 cliente, depois geral. Reversível em 1 toggle.

---

## 9. Roadmap priorizado (ganho × complexidade × risco)

Ordenado por **retorno sobre risco**. Cada item entrega valor sozinho.

| # | Mudança | Ganho custo/lead | Complexidade | Risco de regressão | Arquivos |
|---|---|---:|---|---|---|
| 0 | Relatórios de custo + golden harness | 0 (habilitador) | Baixa | Nenhum (read-only) | `scripts/*`, `evals/*` |
| 1 | Pós-envio consolidado (4→1 chamada) | **~25%** | Média | **Baixo** (não gera texto ao lead) | `respond.ts`, `intelligence.ts`, `qualify-extract.ts`, `funnel-shadow.ts` |
| 2 | Conhecimento lazy: quoteGuidance/salesDna por estado | ~10% | Baixa | Baixo | `orchestrator.ts`, `quote-guidance.ts` |
| 3 | Conversation State + tools por estágio | ~15% | Média-Alta | Médio (mitigado por superconjunto + fallback pleno) | `orchestrator.ts`, `tools.ts`, `queue.ts`, schema (`WaConversation.agentState`) |
| 4 | Redução do loop de tools (paralelo + cache de resultado + teto) | ~10% | Média | Baixo | `orchestrator.ts`, `tools.ts` |
| 5 | Fast-path cheap-tier + cache semântico de FAQ | ~15% | Média-Alta | Médio (exige prova de equivalência) | `respond.ts`, novo `fast-path.ts`, novo `semantic-cache.ts` |
| 6 | Emagrecer prompt estável (FAQ → RAG) | ~5% direto (mais no 1º hit) | Média | Médio (casuística) | `orchestrator.ts`, `KnowledgeChunk` (seed) |

**Ordem recomendada de execução:** 0 → 1 → 2 → 3 → 4 → 5 → 6.
Itens 1 e 2 são "dinheiro fácil": baixo risco, ganho imediato, quase nenhum toque no caminho que fala com o lead. Item 3 é o investimento estrutural que destrava o resto. Itens 5 e 6 são os de maior ganho marginal em volume alto, mas exigem o golden harness (Fase 0) maduro.

Ganho combinado projetado: **~65–70% de custo por lead**, com o comportamento preservado por construção (superconjuntos, fallback pleno, golden gate).

---

## 10. O que este RFC NÃO faz (para não violar o requisito)

- Não troca o modelo, não mexe em temperatura, não resume respostas, não corta perguntas do roteiro.
- Não muda o texto de nenhum prompt aprovado — apenas *quando* cada bloco é carregado.
- Não altera vídeos, PDFs, preços, DNA, tom, fluxo de orçamento nem handoff.
- Não introduz nenhuma resposta gerada por template no lugar de uma resposta hoje gerada pelo modelo.

Se em qualquer ponto a medição (Fase 0) mostrar que uma otimização degrada o golden set, ela **não sobe** — o default é sempre o comportamento atual.

---

## 11. Como a arquitetura escala (resumo do porquê)

- Custo dominado por **chamadas/lead**, não tokens/chamada → itens 1, 4, 5 atacam a variável certa.
- Contexto **carregado por estado** → o custo de um "oi" deixa de ser igual ao de um orçamento.
- **Superconjunto + fallback pleno + golden gate** → segurança monotônica: no pior caso, custa como hoje; nunca degrada o atendimento.
- Tudo **medido pelas tabelas que já existem** → decisões por dado, rollout por flag, reversível.

Com isso, dobrar o volume não dobra o custo do prefixo já cacheado nem multiplica as 4 chamadas assíncronas — o custo cresce perto do número de mensagens de **conteúdo real**, que é a fração que de fato exige a IA.
