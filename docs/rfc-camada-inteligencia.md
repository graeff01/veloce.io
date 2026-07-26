# RFC — Camada de Inteligência da Veloce IA (avaliação + aprendizado contínuo)

**Escopo:** projetar o módulo permanente da plataforma responsável por **observar, avaliar e aprender** com todas as conversas. Duas iniciativas: (A) avaliação automática de qualidade por conversa; (B) motor de aprendizado contínuo (detecção de padrões → recomendações com aprovação humana). Complementa `docs/runtime-veloce.md` (execução) — este é o **plano de observação/inteligência**.

**Invariante inegociável (princípio arquitetural da plataforma):** este módulo é **estritamente observacional**. Ele **mede, detecta padrões, produz relatórios e gera recomendações** — e **nunca** altera o comportamento da IA automaticamente. Toda mudança passa por **aprovação humana**. A separação Runtime (age) × Inteligência (observa) é permanente.

> Nada de código nesta etapa. Este documento é o RFC; a implementação vem por fases, depois da sua aprovação.

---

## 1. Diagnóstico crítico do que já existe (honesto)

A plataforma **já tem** muita infraestrutura de observação — o problema não é ausência, é **fragmentação e falta de camada de topo**. Antes de projetar, o que existe:

| Peça | O que faz hoje | Avaliação honesta |
|---|---|---|
| `evaluation.ts` + `AiResponseEvaluation` | Juiz LLM amostrado avalia **cada RESPOSTA** (overall, naturalness, empathy, clarity, persuasion, qualification, conversationFlow + categoria de fraqueza + sugestão) | **Bom sinal, grão errado.** É por-MENSAGEM, não por-CONVERSA. Não mede playbook/DNA/timing de vídeo-orçamento/oportunidade perdida. Fica enterrado — não vira aprendizado. |
| `intelligence.ts` + `MessageAnalysis`/`LeadObjection` | Classifica intent/sentiment/objeção por mensagem | **Fundação sólida** de sinal bruto. Sub-aproveitada. |
| `insights.ts` | Agrega MessageAnalysis+LeadObjection+LeadProfile → distribuições | **O padrão certo** de agregação explicável. Falta virar recomendação. |
| `learning.ts` | Cruza desfecho real (venda/funil) × abordagem (variante A/B) | **Já é o padrão observacional correto** — o próprio comentário diz "NÃO muta prompt/playbook; produz sinal → humano revisa → promove". É a semente da Iniciativa B. |
| `impact.ts` | Painel de ROI (números bonitos pro dono) | Útil, mas é prova de valor, não aprendizado. |
| **Aba "Aprendizado da IA"** (`AiCorrection` + `portal-aprendizado.tsx`) | Vendedor registra "a IA errou aqui" (quote_rejected/manual) → lista → marcar resolvido | **É um LOG DE CORREÇÕES, não aprendizado.** Ver §2. |
| Golden gate (`evals/`, `golden-diff.ts`) | Prova comportamento idêntico (anti-regressão) | Reaproveitável: avalia comportamento — parente da avaliação de qualidade. |

**Conclusão do diagnóstico:** os **sinais brutos existem e são bons** (juiz, intent/sentiment/objeção, desfecho×abordagem). O que **falta** é a **camada que os unifica em avaliação por conversa + recomendações acionáveis com aprovação humana**. É isso que este RFC projeta.

---

## 2. Análise crítica da aba "Aprendizado da IA" (o que manter/remover/evoluir)

**Como funciona hoje:** é uma tabela `AiCorrection` onde o vendedor escreve o que a IA errou (ex.: a correção do caracol da Maria). A aba lista pendentes, alguém marca "resolvido". Fim.

**Isso é aprendizado? Não.** É um **rastreador de bugs manual**. Ele:
- ❌ não agrega padrões (10 correções sobre a mesma coisa = 10 linhas soltas);
- ❌ não gera recomendação (só descreve o erro);
- ❌ não fecha o ciclo (marcar "resolvido" não muda nada na IA);
- ❌ dá **falsa sensação de aprendizado** — exatamente o que você quer evitar.

**Mas não é lixo — é OURO mal usado.** Uma correção humana é **verdade rotulada** ("um vendedor disse que a IA errou AQUI"). Isso é o dataset mais valioso da plataforma para:
1. **Calibrar o avaliador automático** (o juiz concorda com os humanos? mede a acurácia do módulo);
2. **Alimentar o motor de recomendações** (correções recorrentes sobre frete/catálogo/política → recomendação estruturada).

**Veredito: EVOLUIR, não remover.**
- **Manter** o `AiCorrection` como **fonte de sinal** (verdade rotulada) — não como a feature principal.
- **Remover** a moldura mental de "lista de correções a resolver".
- **Evoluir** a ABA para o **Centro de Evolução** (§5): recomendações baseadas em evidência (das quais as correções humanas são UM dos inputs, ao lado dos sinais automáticos), cada uma com "aprovar → vira mudança".

---

## 3. Arquitetura alvo: a Camada de Inteligência

A plataforma tem duas camadas hoje: **Runtime** (executa o atendimento) e os sinais brutos espalhados. Este RFC formaliza a **terceira camada permanente**:

```
   ┌──────────────────────────────────────────────────────────────┐
   │  RUNTIME (executa)  — orchestrator, tools, policies           │
   │     │ emite eventos: AiInteraction, tool logs, guardrails,     │
   │     │ MessageAnalysis, decisões, desfecho de funil             │
   └─────┼────────────────────────────────────────────────────────┘
         ▼  (sinais — read-only, assíncrono, fora do caminho crítico)
   ┌──────────────────────────────────────────────────────────────┐
   │  CAMADA DE INTELIGÊNCIA (observa) — este RFC                  │
   │                                                                │
   │  A) Avaliador de Conversa    B) Motor de Aprendizado          │
   │     score técnico por           detecção de padrões →         │
   │     conversa (híbrido:          recomendações estruturadas    │
   │     determinístico + juiz)      (evidência + confiança)       │
   │            │                          │                        │
   │            └──────────┬───────────────┘                        │
   │                       ▼                                        │
   │              Fila de Recomendações (pendente)                 │
   └───────────────────────┬──────────────────────────────────────┘
                           ▼   APROVAÇÃO HUMANA (obrigatória)
   ┌──────────────────────────────────────────────────────────────┐
   │  PROMOÇÃO (só quando aprovado) → vira conhecimento/config      │
   │   KnowledgeChunk (RAG) · Playbook · catálogo · FAQ · material  │
   │   Nunca automático. Sempre com um humano no gatilho.           │
   └──────────────────────────────────────────────────────────────┘
```

**A seta de baixo (promoção) NUNCA é automática.** A Inteligência produz a recomendação; o humano aprova; só então vira mudança no Runtime. É o mesmo padrão do `learning.ts` já existente, generalizado.

---

## 4. Subsistema A — Avaliação de Qualidade da Conversa

### 4.1 Objetivo
Cada conversa recebe uma **avaliação técnica** (não uma nota simples): mede se a IA executou o que era esperado, com **breakdown por dimensão + confiança + evidência**.

### 4.2 Dimensões (rubrica — crescível, config por vertical)
Divididas por **como são medidas** — decisão de arquitetura central:

**Determinísticas (baratas, confiáveis, explicáveis — sem LLM):**
- **Cumprimento de políticas:** houve guardrail acionado? preço inventado (grounding)? handoff correto? → dos logs `guardrails`/`decision`/grounding que já existem em `AiInteraction`.
- **Timing de vídeo:** vídeo enviado no 1º contato quando devia? → tool log `enviar_video` × nº do turno.
- **Timing de orçamento:** `gerar_orcamento`/`enviar_orcamento` só após ficha completa? não antes? → tool logs + estado.
- **Descoberta mínima:** ficha preenchida antes de orçar? campos obrigatórios coletados? → `LeadProfile`/intake.
- **Oportunidade perdida (parcial):** lead pediu foto/preço/visita e a IA não respondeu/escalou? → intent (`MessageAnalysis`) × ação (tool log).

**Qualitativas (precisam de juiz LLM — 1 chamada por conversa avaliada):**
- **Qualidade da descoberta de necessidade** (entendeu o lead ou despejou perguntas?).
- **Aderência ao DNA comercial** (seguiu o estilo destilado?).
- **Qualidade da condução** (naturalidade, ritmo, avanço).
- **Oportunidade perdida (nuançada)** (sinal de compra ignorado).

**Meta:**
- **Confiança da avaliação** (0-1): alta quando determinística; menor quando o juiz LLM está incerto ou a conversa é curta/ambígua. Sinaliza o quanto confiar naquele score.

### 4.3 Como funciona (fluxo)
1. **Gatilho:** conversa "fecha" — inatividade (ex.: 6h sem mensagem), funil terminal (convertido/perdido), ou handoff. (Não avalia mid-flow: a conversa ainda não terminou.)
2. **Scorers determinísticos** rodam sobre os eventos já persistidos (grátis).
3. **Juiz LLM** (1 chamada, amostrado no começo, depois configurável) avalia as dimensões qualitativas, recebendo a transcrição + o playbook/DNA/políticas do cliente como referência.
4. Persiste `ConversationEvaluation` (score geral + breakdown por dimensão + confiança + evidências + versão da rubrica).
5. **Nunca** age — só grava.

### 4.4 Reaproveitamento
- **Juiz LLM:** `evaluation.ts` + `lib/ai-agent/eval/judge.ts` (já existem) — estender, não recriar.
- **Sinais determinísticos:** `AiInteraction` (guardrails, decision, toolCalls, stages), `MessageAnalysis`, `LeadProfile` — tudo já gravado.
- **Amostragem/custo:** `shouldSample` (já existe).
- **Rubrica por vertical:** encaixa no **Vertical Pack** do `runtime-veloce.md`.

---

## 5. Subsistema B — Aprendizado Contínuo (motor de recomendações)

### 5.1 Objetivo
Observar padrões reais das conversas e produzir **recomendações estruturadas** — cada uma com **tipo, evidência, confiança e ação proposta** — para **aprovação humana**. Nunca aplica sozinho.

### 5.2 Tipos de recomendação (crescível)
| Tipo | Sinal de origem | Ação proposta (se aprovada) |
|---|---|---|
| Pergunta recorrente sem boa resposta | clusters de perguntas que levaram a abster/"confirmo com vendedor"/baixo score | novo `KnowledgeChunk` (RAG) / FAQ |
| Objeção frequente | `LeadObjection` agregado por tipo/severidade | resposta padrão / ajuste de playbook |
| Informação ausente no conhecimento | perguntas sem fonte (grounding falhou) | novo conteúdo de conhecimento |
| Conteúdo desatualizado | conhecimento com baixa taxa de uso/eficácia, ou contradito por correções | revisar/remover chunk |
| Oportunidade no catálogo | modelos pedidos e não encontrados (`buscar_estoque` sem match) | cadastrar produto/foto |
| Melhoria no playbook | `learning.ts` (abordagem que converte mais) + padrões de score | ajuste do Playbook |
| Necessidade de material | pedidos recorrentes de foto/vídeo/PDF inexistente | produzir vídeo/PDF/imagem |
| Padrão de erro recorrente | `AiCorrection` (humano) + `ConversationEvaluation` (auto) agrupados | correção de config/catálogo/frete/prompt |

### 5.3 Como detecta padrões (decisão de arquitetura — ver alternativas §8)
- **Agregação determinística + limiar** para taxonomias fechadas (objeções, intents, decisões, catálogo sem match). Barato, explicável.
- **Clustering por embedding** para o aberto ("perguntas recorrentes sem boa resposta"): agrupa semanticamente as mensagens que levaram a abster/baixo score → cada cluster grande vira uma recomendação. **Reaproveita o embedding do RAG** (`retrieval.ts`).
- **Síntese LLM** (opcional, no topo): transforma um cluster em texto acionável ("os leads perguntam X; hoje a IA não sabe; sugiro este chunk").

### 5.4 Ciclo de vida da recomendação
```
gerada (pendente) → revisão humana → aprovada → promovida (vira KnowledgeChunk/Playbook/...) 
                                   → rejeitada (com motivo — vira sinal p/ não re-sugerir)
                                   → adiada
```
Cada recomendação guarda **evidência rastreável** (as conversas/mensagens que a originaram) — sem "mágica". A promoção é um passo **explícito e humano**.

### 5.5 Reaproveitamento
- `insights.ts` (agregação), `LeadObjection`, `learning.ts` (abordagem×desfecho), `AiCorrection` (verdade humana), embedding do RAG. Quase tudo já existe — falta a **camada de recomendação** por cima.

### 5.6 Contrato da Recomendação (princípio: evidência mensurável e auditável)

**Princípio arquitetural adicional:** nenhuma recomendação existe sem lastro. Toda recomendação é uma **hipótese com evidência auditável** — não um palpite. Ela SÓ pode ser criada se conseguir preencher, de forma rastreável até o dado bruto, os cinco campos abaixo. Sem eles, não vira recomendação (vira, no máximo, sinal fraco em observação).

| Campo (obrigatório) | O que é | Como é computado (auditável) |
|---|---|---|
| **1. Evidência** | as conversas/mensagens concretas que levaram à conclusão | lista de refs `{contactId, waMessageId, trecho, sinal}` — **clicável até a conversa real**. Nunca um agregado sem o detalhe por trás. |
| **2. Volume** | quantas conversas sustentam | nº de conversas DISTINTAS + janela + **taxa** (ex.: 12 de 340 = 3,5%). A taxa importa mais que o número cru para priorizar. |
| **3. Componente-alvo** | o que deve mudar | enum tipado: `catalogo` \| `playbook` \| `conhecimento(RAG)` \| `politica` \| `midia` \| `ficha/intake` \| `preco`. Roteia a recomendação pro dono/ação certa. |
| **4. Impacto esperado** | o ganho SE aprovada | ver §5.7 — **alcance × correlação com desfecho**, com a premissa explícita. Nunca um número inventado. |
| **5. Confiança** | quão firme é a conclusão | composto de: volume (mais conversas = maior), **consistência** do sinal (todos apontam igual?) e, se veio do juiz LLM, a confiança dele. 0-1, com os fatores expostos. |

**Regra de ouro da auditabilidade:** todo número na tela **desce até o dado** (drill-down). Um "3,5%" abre as 12 conversas. Um "impacto: ~R$ X/mês" mostra a conta. Sem caixa-preta — é o oposto de uma IA que "aprende sozinha".

### 5.7 Como o "impacto esperado" é honesto (não hand-waving)

Estimar impacto ANTES de aplicar é onde quase todo sistema mente. A abordagem honesta, em três níveis de força:

1. **Alcance (sempre disponível):** a taxa do padrão. Se 3,5% das conversas batem nesse gap, corrigir *potencialmente* melhora ~3,5% das conversas futuras. É um proxy de reach, explícito.
2. **Correlação com desfecho (quando dá):** cruzar o padrão com o funil real. Se as conversas com esse gap **travam/perdem** mais que a média (via `learning.ts`/funil), o impacto vira "~N conversas/mês que emperram aqui" — ligado a conversão, não a achismo.
3. **Impacto MEDIDO (fecha o ciclo):** o "esperado" é hipótese. Depois da promoção, o módulo **mede o impacto real** (antes×depois / A-B), validado pelo **golden gate** (não regrediu) + desfecho. Assim cada recomendação promovida vira um **experimento auditável**: previu X, entregou Y. Isso transforma o módulo de "recomendador" em **motor de melhoria mensurável**, e calibra as previsões futuras.

**Priorização objetiva pelo gestor** — uma fórmula transparente e ajustável, não um ranking mágico:

```
prioridade  =  impacto_esperado (alcance × peso_desfecho)  ×  confiança
```

Ordena a fila por isso. `esforço` (adicionar um chunk vs produzir um vídeo) entra como tag secundária/ordenação, nunca escondido num score opaco. O gestor vê: "isto afeta 3,5% das conversas, com 0,8 de confiança, muda o CONHECIMENTO, esforço baixo" → decide com dado.

---

## 6. Armazenamento (tabelas novas mínimas)

Princípio: **reusar o que existe**; criar só o que muda de grão.

| Tabela | Grão | Por quê nova |
|---|---|---|
| `ConversationEvaluation` | 1 por conversa avaliada | `AiResponseEvaluation` é por-mensagem; conversa é grão diferente. Campos: clientId, contactId, scores por dimensão (Json), overall, confidence, rubricVersion, method (det/llm/hybrid), evidence (Json), createdAt. |
| `LearningRecommendation` | 1 por recomendação | **contrato §5.6:** tipo, `targetComponent` (enum), `evidence` (Json: refs de conversas rastreáveis), `conversationCount` + `rate`, `confidence` (+ fatores), `expectedImpact` (Json: alcance/desfecho/premissa), `proposedChange` (Json). **Ciclo:** status (pendente/aprovada/rejeitada/adiada/promovida), approvedByEmail, rejectionReason, promotedRef. **Impacto medido:** `measuredImpact` (Json, pós-promoção — previu×entregou). createdAt. |
| *(reaproveitadas)* | — | `AiResponseEvaluation`, `MessageAnalysis`, `LeadObjection`, `AiCorrection`, `AiInteraction`, `KnowledgeChunk`, `AiUsage`. |

Sem tabela nova para os sinais brutos — eles já existem. Só as duas de topo.

---

## 7. Integração com o Runtime + reaproveitamento

- **Acoplamento zero no caminho crítico:** a Inteligência lê os eventos que o Runtime **já emite** (AiInteraction, tool logs, MessageAnalysis, funil). Roda **assíncrona/batch**, nunca no turno do lead. Se cair, o atendimento não é afetado (mesmo padrão de `updateRollingMemory`/`analyzeMessage`).
- **Multi-tenant:** escopo por `clientId`, `prismaUnscoped` com filtro explícito (padrão de `insights.ts`).
- **Vertical Pack:** a rubrica (A) e os tipos de recomendação (B) são **config por vertical** — a JR (orçamento) tem rubrica diferente do Boqueirão (automotivo). Encaixa no Runtime multi-vertical.
- **Golden gate:** quando uma recomendação aprovada vira mudança (novo chunk, playbook), o **golden gate** (já construído) valida que o comportamento não regrediu. Fecha o ciclo com segurança.
- **Custo:** reaproveita amostragem + `AiUsage` (medição). O juiz por-conversa é 1 chamada barata (gpt-4o-mini) amostrada.

---

## 8. Alternativas e trade-offs (as decisões abertas)

**D1 — Quando avaliar a conversa**
- *Tempo real por turno:* fresco, mas a conversa não terminou + caro. ❌
- *Batch no "fechamento" (inatividade/terminal/handoff):* visão completa, barato. ✅ **recomendado**
- *Híbrido:* scorers determinísticos acumulam por turno (grátis), juiz LLM no fechamento. ✅✅ **melhor** (evidência já pronta no fechamento)

**D2 — Determinístico × LLM para os scores**
- *Tudo LLM:* flexível, mas caro, varia e menos explicável. ❌
- *Tudo determinístico:* barato/explicável, mas não mede "qualidade da condução". ❌
- *Híbrido (det. onde dá + 1 juiz p/ o qualitativo):* barato, explicável no que importa, flexível no resto. ✅ **recomendado.** (Muitas dimensões que você listou — timing de vídeo/orçamento, políticas — são determinísticas de graça.)

**D3 — Detecção de padrões (B)**
- *Só agregação/limiar:* barato/explicável, mas não acha o "aberto" (perguntas novas). 
- *Só LLM sobre lotes:* rico, mas caro e pouco rastreável.
- *Agregação (taxonomias) + embedding clustering (aberto) + síntese LLM no topo do cluster:* cobre fechado e aberto, reusa o embedding do RAG, mantém evidência. ✅ **recomendado**

**D4 — Aba "Aprendizado": reformar × substituir**
- *Manter como está:* falsa sensação de aprendizado. ❌
- *Remover:* perde a verdade rotulada humana. ❌
- *Evoluir para Centro de Evolução, com `AiCorrection` como um sinal:* ✅ **recomendado**

**D5 — Onde a rubrica/tipos moram**
- *Hardcoded:* simples, mas não escala pra N verticais. 
- *Config por Vertical Pack:* padrão da plataforma, cliente novo = config. ✅ **recomendado**

---

## 9. Impacto esperado e riscos

**Impacto (valor real, não teatro):**
- Visão objetiva de **onde a IA falha** (por dimensão, por conversa) — vs "achismo".
- Fila de melhorias **priorizada por evidência** (quantas conversas, qual confiança) — não uma lista de bugs.
- Ciclo fechado: recomendação → aprovação → promoção → **golden gate valida** → melhoria permanente.
- Calibração: concordância juiz×humano vira métrica de confiança do próprio módulo.

**Riscos e mitigação:**
| Risco | Mitigação |
|---|---|
| Juiz LLM impreciso/enviesado | dimensões determinísticas onde possível; confiança explícita; calibração contra `AiCorrection` humano |
| Falsa sensação de aprendizado (de novo) | recomendação SÓ existe com evidência rastreável + ação concreta; "resolvido" não conta, "promovido" conta |
| Custo do juiz por conversa | amostragem + 1 chamada barata + só no fechamento |
| Recomendação ruim promovida | aprovação humana obrigatória + golden gate valida pós-promoção |
| Vazar entre tenants | escopo por clientId, padrão `insights.ts`, sem cross-client |
| Virar mais um painel ignorado | priorização por impacto + integração no fluxo que o dono já usa |

---

## 10. Roadmap em fases (incremental, cada fase entrega valor)

0. **Instrumentar + baseline** — confirmar que os sinais necessários já são emitidos (são); definir a rubrica v1 e os tipos de recomendação v1 (config). *Read-only.*
1. **Avaliador determinístico** — scorers sem LLM (políticas, timing de vídeo/orçamento, descoberta, oportunidade). Já dá `ConversationEvaluation` explicável e **de graça**. Primeiro valor, zero custo de modelo.
2. **Juiz de conversa (LLM)** — adiciona as dimensões qualitativas + confiança. Amostrado. Reusa `evaluation.ts`.
3. **Motor de recomendações v1** — agregação determinística (objeções, catálogo sem match, correções recorrentes) → `LearningRecommendation`. Reusa `insights.ts`.
4. **Clustering do aberto** — embedding das perguntas sem boa resposta → recomendações de conhecimento/FAQ. Reusa RAG.
5. **Centro de Evolução (a aba evoluída)** — UI: recomendações priorizadas + evidência + "aprovar → promover". `AiCorrection` vira um sinal aqui.
6. **Promoção + golden gate** — aprovar recomendação gera o chunk/playbook; o golden gate valida a não-regressão. Ciclo fechado.

Fases 1 e 3 entregam valor **sem custo de modelo** (determinístico). O LLM entra onde agrega (2 e 4).

---

## 11. Os dois invariantes (os princípios)

**Invariante 1 — Estritamente observacional.** Este módulo **observa e recomenda**. Ele **nunca**:
- muda prompt, playbook, catálogo ou conhecimento sozinho;
- decide nada sobre o atendimento;
- aplica uma recomendação sem um humano no gatilho.

**Invariante 2 — Evidência mensurável e auditável (§5.6).** Nenhuma recomendação existe sem lastro. Toda recomendação carrega evidência rastreável até a conversa, volume/taxa, componente-alvo, impacto esperado (honesto) e confiança — e **desce até o dado** em qualquer número exibido. O que não tem evidência não vira recomendação. E toda recomendação promovida é **medida depois** (previu × entregou) — hipótese que vira experimento auditável.

A IA **nunca altera o próprio comportamento**, e nenhuma sugestão é aceita "no achismo". A Inteligência é o microscópio e o conselheiro **baseado em prova**; a mão que muda é sempre humana. Essa separação — observar com evidência, decidir com humano — é permanente e é o que torna a plataforma **auditável e confiável**, o oposto de uma caixa-preta que "se ajusta sozinha".

---

## 12. Spec detalhado da Fase 1 — Avaliador determinístico (pronto pra implementar)

Primeira fase por escolha deliberada: **zero custo de modelo**, valor imediato, 100% explicável. Só usa sinais que o Runtime **já emite**. As decisões que ficaram abertas, resolvidas com default sensato (ajustável):

### 12.1 Rubrica v1 (só dimensões determinísticas)
Cada dimensão devolve `{ score: 0..1, status, evidence[] }`. `evidence` referencia `AiInteraction`/`waMessageId` reais (drill-down).

| Dimensão | Fonte (já existe) | Regra de score |
|---|---|---|
| **Políticas** | `AiInteraction.guardrails`, `decision`, grounding | 1.0 sem violação; penaliza guardrail bloqueado, preço sem fonte (grounding), handoff prometido sem tool. |
| **Timing de vídeo** | tool log `enviar_video` × nº do turno (só se `presentationVideoUrl`) | enviado no 1º contato = 1.0; tarde = parcial; nunca (quando devia) = 0; repetido = penaliza. |
| **Timing de orçamento** | tool logs `gerar_orcamento`/`enviar_orcamento` + estado da ficha (só se `quotesEnabled`) | gerou só com ficha completa e enviou o PDF = 1.0; prematuro/sem ficha = penaliza; lead pediu e não gerou = 0. |
| **Descoberta mínima** | `LeadProfile`/intake vs campos obrigatórios | % dos campos obrigatórios coletados antes de orçar/encerrar. |
| **Oportunidade perdida** | `MessageAnalysis.intent` (PRICE_QUESTION, VISIT_INTENT, BUYING_SIGNAL, READY_TO_CLOSE) × ação da IA no turno | sinal de compra respondido/escalado = 1.0; ignorado = 0, com a mensagem exata como evidência. |
| **Handoff** | `decision`=escalou × sinais do funil/intent | escalou quando devia (negociação/fechar) e não escalou à toa = 1.0. |

`overall` = média ponderada (pesos por vertical, no Vertical Pack). `confidence` = **alta** (é determinístico); baixa só quando a conversa é curta demais pra medir (ex.: 1 turno).

### 12.2 Gatilho ("conversa fechou") — decisão
Avalia **uma vez por fechamento**, definido como o **primeiro que ocorrer**:
- **inatividade** ≥ `evalCloseHours` (default **6h** sem nova mensagem), OU
- **funil terminal** (`convertido`/`perdido`), OU
- **handoff** para humano (takeover).

Se o lead voltar depois, a conversa "reabre" → nova avaliação cobre a janela estendida (idempotência por `(contactId, closureAt)`). Roda em **cron** (reusa o padrão de `autoReplyStalled`/schedulers já existentes), varrendo conversas recém-fechadas **sem** avaliação.

### 12.3 Armazenamento
`ConversationEvaluation`: `clientId, contactId, closureAt, windowStart, overall, dimensions(Json), confidence, method="deterministic", rubricVersion, evidence(Json), createdAt` — `@@unique([contactId, closureAt])` (idempotente). Sem tabela de sinal nova (tudo já existe).

### 12.4 Fluxo (assíncrono, fora do caminho crítico)
```
cron → conversas fechadas sem ConversationEvaluation
     → carrega AiInteraction + toolCalls + MessageAnalysis + LeadProfile (da conversa)
     → roda os 6 scorers determinísticos (puros, testáveis, ZERO chamada de modelo)
     → persiste ConversationEvaluation (com evidência rastreável)
```
Se falhar, não afeta atendimento (mesmo padrão best-effort dos schedulers).

### 12.5 O que entrega (visível)
- **Por conversa:** o score técnico com breakdown por dimensão + a evidência clicável (abre a mensagem). Aparece junto da conversa no painel.
- **Agregado:** média por dimensão no tempo + as **piores conversas** (pra o gestor revisar) + tendência. É o insumo do futuro Centro de Evolução (Fase 5) e das recomendações (Fase 3).

### 12.6 Decisões nas perguntas abertas
1. **Rubrica v1** = as 6 dimensões determinísticas acima (começa de graça; DNA/condução entram na Fase 2 com o juiz).
2. **Gatilho** = 6h de inatividade OU terminal OU handoff (configurável por `evalCloseHours`).
3. **A aba** = **evoluir** a `portal-aprendizado.tsx` existente para o Centro de Evolução, com `AiCorrection` como um dos sinais — **não** construir um painel paralelo.

### 12.7 Testabilidade
Os 6 scorers são **funções puras** (evento da conversa → score+evidência) — testáveis sem banco nem modelo, com casos golden (mesma disciplina do `pricing-policies.test.ts`). É o que garante que a avaliação seja confiável e não "mais um número".
