# Veloce IA Runtime — Arquitetura de plataforma multi-tenant

**Escopo:** este documento define o **Runtime permanente** da Veloce IA — a base que deve atender dezenas/milhares de clientes de verticais diferentes, compartilhando o mesmo motor, sem reescrita a cada cliente novo. Complementa o RFC de custo (`docs/arquitetura-custo-escala.md`): o RFC diz *o que otimizar*; este documento diz *qual é a forma permanente* em que essas otimizações passam a morar.

**Invariante inegociável:** nenhuma mudança estrutural pode alterar o texto que o cliente final recebe. As IAs já existentes (Boqueirão, JR) devem responder **exatamente igual**. A arquitetura abaixo é desenhada para tornar isso uma **propriedade estrutural**, não uma esperança.

---

## 1. Princípio de design: separar *o que a IA diz* de *como o Runtime a monta*

Hoje, o `orchestrator.ts` (585 linhas) faz **tudo** num único fluxo: resolve config, monta prompt, escolhe tools, roda o loop, aplica guardrails, loga. Isso funciona para poucos clientes, mas acopla decisões que precisam evoluir em ritmos diferentes.

O Runtime separa em **plano de controle** (decide *o que carregar*) e **plano de dados/geração** (monta e gera). O LLM continua sendo o cérebro conversacional — tom, DNA, roteiro. O Runtime só decide **o que entra no contexto dele** e **quais capacidades ficam disponíveis**.

```
                         ┌────────────────────── TENANT CONTEXT ──────────────────────┐
                         │  clientId · vertical · AiAgentConfig · flags · playbook      │
                         └──────────────────────────────┬──────────────────────────────┘
   inbound ─► Runtime de Execução (pipeline de estágios nomeados)
                 │
                 ├─ Policy Engine (pré)      → pode responder? escopo? caps? takeover?
                 ├─ Middleware/Classifier    → tipo de turno · resolve Conversation State
                 ├─ Capability Graph         → (vertical × estado × flags) → capacidades ativas
                 ├─ Composite Hydration       → busca o contexto do estado de UMA vez
                 ├─ Prompt Compiler          → monta as mensagens (prefixo estável cacheável)
                 ├─ Tool Registry            → expõe só as tools das capacidades ativas
                 ├─ Generation loop          → chamadas ao modelo (menos round-trips)
                 └─ Policy Engine (pós)      → grounding · guardrail · verify
                 │
                 └─► resposta idêntica à de hoje
```

---

## 2. Os 10 componentes permanentes — estado atual × alvo

Legenda: **Existe** (já é componente) · **Implícito** (existe embutido, precisa ser extraído) · **Novo** (a construir).

| # | Componente | Hoje | Onde no código | Alvo permanente |
|---|---|---|---|---|
| 1 | **Runtime de Execução** | Implícito | `orchestrator.ts` `runAgent`, `queue.ts`, `respond.ts` | Pipeline de **estágios nomeados** (gate→classify→state→hydrate→compile→generate→guard→post), cada um isolado, testável e substituível. Hoje já há a timeline `stages[]` logada — formalizar em código. |
| 2 | **Prompt Compiler** | Implícito | `buildStablePrompt`, `buildDynamicContext`, montagem inline do array `messages` | Unidade dedicada e **versionada** que recebe (tenant, estado, contexto hidratado, módulos) → array de mensagens **determinístico**, com **garantia de prefixo estável byte-a-byte** (cache) e emissão de strings idênticas às atuais. |
| 3 | **Policy Engine** | Implícito/espalhado | `gatekeeper.ts`, `guardrail.ts`, `grounding.ts`, `verify.ts`, `limits.ts`, `blocklist.ts`, `optout.ts`, takeover em `respond.ts` | Conjunto **declarativo** de políticas pré e pós-geração, resolvidas por (universal → vertical → tenant). Já é vertical-aware (`resolveBlockRules`) — promover a motor único. |
| 4 | **Capability Graph** | Novo (parcial) | `toolsForConfig` faz só flags→tools | Grafo que liga **capacidades** (tool + conhecimento + módulo de prompt) a **(vertical × estado × flags)**. Fonte única que o Middleware e o Prompt Compiler consultam. É o que permite "cliente novo sem código novo". |
| 5 | **Tool Registry** | Implícito | `TOOL_DEFS[]` + `toolsForConfig` + `switch` em `executeTool` | Registro onde cada tool **declara** `{schema, estágios, configRequerida, vertical, executor, efeitoColateral, custo}`. Habilita stage-gating, tools compostas e tools por vertical sem editar `switch`. |
| 6 | **Conversation State** | Implícito | `funnelStage` (CRM), `slotState`, `scoreLead`, `aiSuggestedStage` | `agentState` **explícito** como eixo de orquestração (≠ funil de CRM), derivado dos mesmos sinais, **grafo declarativo por vertical**. Central, não só otimização. |
| 7 | **Middleware / Classifier** | Novo | — (hoje o LLM se auto-roteia via tool-call) | Control plane **determinístico-primeiro**: classifica turno, resolve estado, decide fast-path, seleciona capacidades, dispara hidratação. **Nunca** decide o texto. |
| 8 | **Composite Hydration** | Novo (peças existem) | `retrieval.ts`, `catalog-search.ts`, `searchCatalog` | Pré-busca **determinística** do "bundle" de contexto do estado (estoque + fotos + conhecimento) numa passada, **antes** do LLM → responde em menos round-trips. |
| 9 | **Multi-tenant** | Existe (sólido) | `prisma`/`prismaUnscoped` (guard por `clientId`), `AiAgentConfig` por cliente, isolamento em `respond.ts` | Formalizar um **TenantContext** único, roteado por todo o pipeline; toda capacidade/política/prompt resolve através dele. Manter o isolamento atual como invariante testada. |
| 10 | **Config por Vertical** | Existe (parcial) | `vertical`, `playbook`, `DEFAULT_BY_VERTICAL` (guardrail), `customPrompt`, `intakeSpec` | Elevar a **Vertical Pack** = `{promptModules, capabilityGraph, policySet, stateGraph, intakeSpec, pricingModel}`. Segmento novo = pacote novo, **zero** mudança no motor. |

**Leitura crítica:** 6 dos 10 já existem de alguma forma — o trabalho é majoritariamente **extração e formalização** de coisas embutidas no `orchestrator.ts`, não invenção. Os 3 realmente novos (Middleware, Composite Hydration, Capability Graph) são o que transforma o motor de "monólito que funciona" em "plataforma que escala". Isso reduz o risco: refatoração guiada por comportamento conhecido, não reescrita.

---

## 3. Como o comportamento é preservado por construção

Quatro travas estruturais (não "cuidado manual"):

1. **Golden gate (bloqueia merge):** todo PR roda o conjunto `evals/cases/*.json` + um diff comportamental (mesma `decision`, mesmas tool-calls, mesma presença de foto/PDF/vídeo, similaridade textual alta) contra respostas congeladas. Drift ⇒ não sobe. Infra já existe (`run-evals.ts`, `harvest-goldens.ts`, `score-production.ts`, `lib/ai-agent/eval/*`).
2. **Prompt Compiler byte-idêntico:** a refatoração do compiler é validada por um teste que compara, para N configs reais, a string montada nova × a atual — igualdade exata. Só então o compiler antigo é aposentado.
3. **Superconjunto + fallback pleno:** capacidades por estado são sempre superconjunto do que o modelo usaria ali; ambiguidade ⇒ modo pleno (comportamento atual). Segurança **monotônica**: pior caso = custo de hoje, nunca degrada.
4. **Shadow antes de authority:** todo componente novo (estado, middleware) roda primeiro em **shadow** (só observa e loga divergência), como o `funnel-shadow` já faz hoje, antes de virar autoridade. Flip por flag, reversível.

---

## 4. Modelo multi-tenant / Vertical Pack (a base para "milhares de clientes")

```
VerticalPack ("automotivo" | "churrasqueira" | ...)
 ├─ promptModules   : blocos de prompt (núcleo + casuística) — dados, não código
 ├─ stateGraph      : estados e transições do vertical
 ├─ capabilityGraph : estado → {tools, knowledge, promptModules}
 ├─ policySet       : guardrail/grounding/verify padrão do vertical
 ├─ intakeSpec      : ficha a coletar
 └─ pricingModel    : regras de preço/frete (quando aplicável)

TenantConfig (AiAgentConfig, por cliente)  =  VerticalPack  +  overrides
 ├─ customPrompt / persona / goals / rules  (override de promptModules)
 ├─ flags: quotesEnabled, visionEnabled, voiceReplies, salesDnaEnabled, ...
 ├─ assets: presentationVideoUrl, catalogPdfUrl, optionsImageUrl
 └─ blockedTopics (override do policySet)
```

Cliente novo = escolher um Vertical Pack + preencher `AiAgentConfig` (assets, flags, conhecimento) → **onboarding é dado, não deploy**. Já é a direção do sistema (config-first); o Runtime a torna completa.

---

## 5. Onde isso encosta no RFC de custo

Os componentes permanentes **são a forma** em que as otimizações do RFC passam a morar:

| Otimização do RFC | Componente permanente que a hospeda |
|---|---|
| Pós-envio consolidado (4→1) | Runtime de Execução (estágio pós) + Middleware (reusa a classificação) |
| Conhecimento lazy | Capability Graph + Prompt Compiler |
| Tools por estágio | Tool Registry + Capability Graph + Conversation State |
| Menos round-trips | Composite Hydration + Generation loop |
| Fast-path | Middleware + Policy Engine |
| Prompt enxuto | Prompt Compiler + Vertical Pack (promptModules) |

Ou seja: **não há trabalho jogado fora**. Cada fase do RFC entrega custo *e* deposita um tijolo do Runtime permanente.

---

## 6. Sequência (isolada, reversível, com gate por fase)

Segue o roadmap do RFC; cada fase deposita um componente permanente:

0. **Medição + Golden gate** — baseline real (custo/lead, chamadas/lead, cache hit-rate, histograma de turnos) + rede de segurança. *Nenhum toque no atendimento.*
1. **Pós-envio consolidado** — primeiro estágio formal do Runtime; entrega a classificação que o Middleware reusa.
2. **Conversation State (shadow→authority)** — o eixo central. Deposita o componente 6.
3. **Capability Graph + Tool Registry** — extrai `toolsForConfig`/`TOOL_DEFS` para o registro declarativo. Componentes 4 e 5.
4. **Prompt Compiler** — extrai a montagem de prompt; valida byte-a-byte. Componente 2.
5. **Middleware + Composite Hydration** — control plane + prefetch. Componentes 7 e 8.
6. **Policy Engine + Vertical Pack** — unifica políticas e empacota o vertical. Componentes 3 e 10.

O TenantContext (9) e o Runtime pipeline (1) são transversais — formalizados incrementalmente ao longo de 1→6.

**Critério de sucesso (métricas reais, não promessa):** redução de custo/lead, redução de chamadas/lead, comportamento mantido (golden gate verde), zero regressão funcional, e cada componente permanente entregue e testado.
