# RFC — Camada de Inteligência, Etapa 2: de "detectar" para "explicar e investigar"

**Escopo:** evoluir o módulo de recomendações de uma ferramenta que **detecta** para uma ferramenta de **gestão baseada em evidências** que **explica, investiga, prioriza e acompanha tendências**. Mantém o invariante permanente: a IA **nunca** altera o próprio comportamento — observa, analisa, mede e recomenda para aprovação humana.

> Fase de projeto. Nada de implementação nesta etapa.

---

## 1. Análise crítica do módulo atual (honesta)

O que existe hoje (Fases 1–6, já no ar) e onde é **raso**:

| Capacidade hoje | Estado | Limitação honesta |
|---|---|---|
| Detecção de padrões | ✅ bom | acha o QUE (12 conversas, handoff falhou) |
| Evidência (conversas) | ✅ | lista plana de refs — sem "o que elas têm em comum" |
| Componente-alvo | ✅ enum | genérico ("playbook") — não aponta a ORIGEM exata |
| Confiança | ⚠️ raso | é `f(volume)` — um número, **sem justificativa** |
| Impacto esperado | ⚠️ raso | só "alcance" (% de conversas) — **sem severidade nem desfecho** |
| "Por quê" / causa raiz | ❌ ausente | não explica **por que** aconteceu |
| Dimensão temporal | ❌ ausente | sem "quando começou", "está crescendo?" |
| Tendências | ❌ ausente | só o estado atual, sem evolução |
| Priorização | ⚠️ raso | só `alcance × confiança` — 2 fatores |

**Diagnóstico:** o módulo hoje é um bom **detector**. Falta a camada de **explicação e investigação** que transforma "existe um problema" em "aqui está o problema, por que acontece, onde atacar e quanto vale". É exatamente o pedido desta etapa — e são gaps reais, não features por features.

---

## 2. O princípio central desta etapa (o que evita virar "IA que adivinha")

**A explicação tem que ser DERIVADA DO DADO, não inferida por um modelo.**

Você foi explícito: *"não quero recomendações baseadas apenas em inferência"*. Isso descarta a abordagem preguiçosa (pedir pra um LLM "explicar por que a IA errou" — que seria um chute plausível, não uma prova). A abordagem certa:

> **O "porquê" = o que as conversas marcadas têm em comum, medido contra a linha de base.**

Ex.: "handoff falhou em 12 conversas" → o módulo olha os FATOS dessas 12 (intenção do lead, decisão da IA, etapa do funil, produto, horário) e descobre: **"em 10 das 12, o lead mandou uma NEGOCIAÇÃO de preço e a IA respondeu a dúvida em vez de escalar"**. Isso é factual, auditável, e aponta a origem exata (a regra de handoff diante de negociação). Não é inferência — é mineração de fatores.

Um LLM pode, no MÁXIMO, **redigir em linguagem natural** os fatores que o dado já provou — nunca inventar a conclusão. A conclusão vem sempre da evidência.

---

## 3. As capacidades pedidas — design + trade-offs

### 3.1 Explicação / causa raiz — "mineração de fatores" (determinística)
Para cada recomendação, comparar as conversas da evidência com a **linha de base** (todas as conversas do período) e achar os fatores **sobre-representados**:
- **Sinais disponíveis (já emitidos):** intenção do lead (`MessageAnalysis`), decisão da IA, tools chamadas, etapa do funil, guardrails, produto (`buscar_estoque`/interesse), horário, tamanho/idioma da mensagem.
- **Método:** para cada fator, `prevalência no grupo` vs `prevalência na base` → **lift**. Fatores com lift alto e cobertura alta viram os "contributingFactors" (ex.: `intent=PRICE_NEGOTIATION` presente em 83% do grupo vs 6% da base → lift 14×).
- **Saída:** 1–3 fatores dominantes, cada um com sua cobertura ("em X de N conversas") — a explicação auditável.
- **Trade-off:** precisa dos fatores estarem nos dados (estão). É mineração simples (associação/lift), não ML — barato, explicável, sem inferência. ✅ **recomendado.**
- **Descartar:** LLM "explicando" o motivo (viola o princípio). O LLM entra só como *redator* opcional dos fatores factuais.

### 3.2 Confiança explicável — decomposição
Trocar o número solto por uma **decomposição** com pesos visíveis:
```
confiança = f(volume, consistência, recência, [concordância do juiz])
```
- **Volume:** quantas conversas (mais = maior).
- **Consistência:** quão uniforme é o padrão — a força do fator dominante (10/12 no mesmo fator = alta; disperso = baixa). **Este é o pulo do gato:** confiança alta ≠ muitas conversas; é muitas conversas *que compartilham a mesma causa*.
- **Recência:** o padrão é atual (relevante) ou antigo (talvez já resolvido)?
- **Concordância do juiz** (quando a dimensão veio do LLM): o juiz concordou com o determinístico?
- **Saída:** "confiança 0.86 — volume alto (12), consistência alta (10/12 mesma causa), recente (14 dias)". Cada fator clicável. ✅

### 3.3 Investigação — a partir da própria evidência (sem tabela nova)
Ao abrir uma recomendação, o gestor vê:
- **Os fatores dominantes** (§3.1) — "o que essas conversas têm em comum".
- **A linha do tempo** derivada dos `createdAt` das conversas da evidência: primeira ocorrência, distribuição por semana, **tendência** (recente vs anterior).
- **As conversas**, cada uma com o fator destacado (por que ELA entrou) e link pra abrir.
- **Insight (§3.5):** "começou há 3 semanas, crescendo".
- **Chave de arquitetura:** a dimensão temporal **deriva dos timestamps da evidência** — não precisa de tabela de série temporal nova. Simplicidade. ✅

### 3.4 Priorização multifator — o modelo que proponho
Você listou: impacto, frequência, confiança, recorrência, urgência. **NÃO recomendo uma soma ponderada de 5 fatores** (pesos arbitrários = caixa-preta). Recomendo um **modelo de VALOR ESPERADO**, transparente e cada fator com significado real:
```
prioridade  =  Impacto  ×  Confiança  ×  Urgência
```
- **Impacto** = `alcance (% conversas)` × `severidade (peso por tipo)` × `correlação com desfecho`. Um handoff perdido num lead quente pesa mais que um deslize de tom. (§3.6)
- **Confiança** = a decomposta (§3.2).
- **Urgência** = derivada da **tendência** (crescendo → >1; estável → 1; diminuindo → <1) + recência. Isto **absorve a "urgência" e a "frequência"** — sem campo subjetivo manual.
- **Recorrência** = entra via a linha do tempo (padrão que persiste por muitas semanas = sistêmico → severidade maior).
- **Por que multiplicação, não soma:** captura que uma recomendação só é top-prioridade se for impactante **E** confiável **E** urgente — um fator fraco derruba a prioridade, como deve ser. E é 100% explicável ("prioridade alta porque afeta 5% × é grave × está crescendo × confiança alta").
- **Trade-off:** severidade precisa de um mapa por tipo (default configurável no Vertical Pack); correlação com desfecho precisa de dado de funil suficiente (senão, cai pra alcance × severidade, dito explicitamente). ✅

### 3.5 Tendências — com honestidade estatística
- Por padrão (por sinal/tipo/tópico): `taxa na janela recente` vs `janela anterior` → **crescendo / estável / diminuindo / novo**.
- **Novo padrão:** aparece na janela recente e não na anterior.
- **Honestidade no volume baixo:** a 1.600 leads/mês, semanas são pequenas. Só declara tendência quando o sinal é **significativo** (mínimo de ocorrências + variação relevante); senão, "dados insuficientes". Nada de gráfico bonito mentindo movimento. ✅
- **Descartar:** projeções/forecast — não há volume pra prever; apenas descrever a direção observada.

### 3.6 Impacto esperado — em 3 níveis (honesto)
1. **Alcance** (já existe): % de conversas afetadas.
2. **Severidade:** peso por tipo (handoff perdido/oportunidade > tom/verbosidade) — configurável.
3. **Correlação com desfecho:** as conversas marcadas **convertem/avançam menos** que a base? Cruzando com o funil (`learning.ts`), vira "~N leads/mês potencialmente perdidos aqui". **Este é o número que o gestor entende.**
- Honesto: quando o desfecho é escasso, mostra alcance × severidade e diz "correlação com desfecho: dados insuficientes". Nunca finge precisão.

### 3.7 Origem exata do problema
`targetComponent` (enum) continua, mas a **mineração de fatores refina a origem**: não só "playbook", mas "a regra de handoff diante de negociação de preço" (derivado do fator dominante). O gestor sabe **onde** atuar, não só em qual módulo.

---

## 4. O que descartar / manter simples

- ❌ **LLM como fonte do "porquê"** — viola o princípio (inferência). Só redator dos fatos.
- ❌ **Soma ponderada de 5 fatores** na priorização — opaca. Modelo de valor esperado (multiplicativo) é transparente.
- ❌ **Forecast de tendências** — sem volume; só descrever direção observada.
- ❌ **Tabela de série temporal nova** — a linha do tempo deriva dos timestamps da evidência.
- ❌ **Campo "urgência" manual** — urgência = tendência (objetiva).
- ✅ **UI continua simples:** o card ganha um "Investigar" que revela porquê (fatores) + linha do tempo (mini-sparkline) + decomposição da confiança + evidência. Rico por trás, simples na frente.

---

## 5. Armazenamento, integração, reuso

- **Sem tabela nova.** Estender `LearningRecommendation` com campos calculados na geração: `contributingFactors` (Json), `confidenceBreakdown` (Json), `timeline` (Json: buckets/firstSeen/trend), `impactModel` (Json: reach/severity/outcome). Tudo derivado de dado já emitido.
- **Reaproveita:** `MessageAnalysis`/`AiInteraction` (fatores), `ConversationEvaluation` (dimensões), `learning.ts` (desfecho×abordagem, para a correlação), o embedding do RAG (tópicos). A mineração de fatores é agregação determinística — mesmo padrão de `insights.ts`.
- **Custo:** zero de modelo (é análise de dado). O LLM-redator opcional é 1 chamada barata amostrada, off por padrão.
- **Invariante intacto:** tudo continua observacional; só enriquece a recomendação. A aprovação segue humana; a promoção segue validada pelo golden gate.

---

## 6. Roadmap em fases (cada uma entrega valor sozinha)

0. **Baseline de fatores** — catalogar os fatores minerables (intent, decisão, funil, produto, hora) e a linha de base. *Read-only.*
1. **Mineração de fatores (o "porquê")** — `contributingFactors` por recomendação (lift vs base). O maior salto de valor, zero custo de modelo.
2. **Confiança explicável** — decompor em volume/consistência/recência. Reusa a força do fator dominante.
3. **Linha do tempo + tendência** — derivar dos timestamps da evidência (primeira ocorrência, por semana, direção) + honestidade estatística.
4. **Priorização por valor esperado** — Impacto(alcance×severidade×desfecho) × Confiança × Urgência(tendência). Substitui o `rate×confidence` atual.
5. **Correlação com desfecho** — cruzar as conversas marcadas com o funil → "leads/mês em risco".
6. **UI "Investigar"** — a visão de investigação (fatores + linha do tempo + confiança + evidência) no card. Redator LLM opcional (off) só pra fraseado.

Fases 1–5 são **determinísticas, zero custo de modelo**. A 6 é UI + um redator opcional off.

---

## 7. Resumo do princípio

A Etapa 2 não adiciona features — ela faz o módulo **provar suas conclusões**. Cada recomendação passa a responder *por que, com base em quê, onde, quanto vale e para onde está indo* — tudo **derivado de dado real**, auditável linha por linha. A IA continua sem tocar em si mesma; o que muda é que o gestor deixa de "confiar no número" e passa a **entender a evidência**. Simples na tela, rigoroso por trás.
