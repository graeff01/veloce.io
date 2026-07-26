# RFC — Prompt Compiler: arquitetura de consolidação sustentável do customPrompt

**Status:** Projeto (RFC-first — nada implementado)
**Autor:** Douglas + Claude
**Data:** 2026-07-26
**Cliente-piloto:** JR Churrasqueiras (`customPrompt` de ~20,6k chars / ~5,1k tokens)
**Invariante inegociável:** qualquer consolidação com risco de alterar comportamento **só é adotada após passar pela suíte de simulação baseada em conversas reais** (ver `veloce-replay-simulation`) + golden gate. Consolidar ≠ mudar o que a IA faz.

---

## 1. Problema

O `customPrompt` não cresce por necessidade — cresce por **falta de arquitetura**. Toda correção (as 4 de hoje inclusive) vira **prosa nova colada no fim ou no meio**, porque não existe uma regra de **onde cada tipo de conteúdo mora**. Resultado: o mesmo conceito acaba escrito em 3–6 lugares, números de negócio ficam duplicados entre prompt e motor, e listas de catálogo incham o prefixo cacheado.

Isso é gerenciável hoje (20k, ~R$3–6/mês de custo marginal — irrelevante). O problema é a **trajetória**: sem freio arquitetural, em 12 meses são 40k, com regras conflitantes que ninguém consegue auditar, e o risco deixa de ser custo e passa a ser **comportamento imprevisível** (duas regras que se contradizem → o modelo escolhe uma ao acaso).

O objetivo **não é reduzir tokens a qualquer custo**. É construir um **compilador de prompt** onde cada conceito tem **um lar canônico**, de modo que a evolução futura seja *bounded* por construção.

---

## 2. Auditoria do customPrompt atual (evidência)

### 2.1 Redundâncias / regras duplicadas

| # | Conceito | Onde aparece | Ocorrências |
|---|---|---|---|
| R1 | "Nunca invente; specs/valores vêm do motor/Conhecimento" | L20, L30, L35, L74(Blindagem 2), L78(Blindagem 6), L21 | **6** |
| R2 | "Acessórios EXCLUSIVOS da Gourmet" | L15, L17, L24, L66 | **4** |
| R3 | "Uma pergunta por mensagem / uma coisa por vez" | L4, L7, L16 | **3** |
| R4 | Política de foto (manda no modelo citado; não spammar; não reenviar) | L12, L25, L33 | **3** |
| R5 | "Ofereça retirada OU entrega+montagem" | L36, L52, (L24/L58) | **3** |
| R6 | "Não escale por dúvida de preço/modelo/frete — é com você" | L31, L44 | **2** |
| R7 | "Modelo específico vs catálogo completo" | L4, L13 | **2** |
| R8 | Pergunta "primeiro contato / já esteve na loja" | L2, L50–51 | **2** |
| R9 | Blocos de concreto (R$35, máx 5) | L56, L66 | **2** |
| R10 | "Não pergunte 'quer montagem?' / montagem depende de zona" | L15, L40 | **2** |

### 2.2 Conflitos entre instruções (mais grave que redundância)

- **C1 — Medida específica: escalar vs oferecer a mais próxima.**
  L74 (Blindagem 2): pedido "nessa medida específica" → *"NÃO afirme que tem… use escalar_humano"*.
  L81 (Conjuntos): "tem uma de 74cm?" → *"sempre indique proativamente a medida DISPONÍVEL mais próxima… Nunca responda só 'não temos'"*.
  → Instruções **opostas** para o mesmo tipo de pergunta. O modelo tem que adivinhar quando escalar vs quando auto-atender.

- **C2 — Combinação custom: escalar vs montar.**
  L74 (Blindagem 2): "o modelo X com Y" custom → escalar_humano.
  L85 (Conjuntos): "Prime 16 com fogão de 3 bocas" → *"apenas MONTE o orçamento… sem disclaimer"*.
  → Fronteira implícita (combinar itens **existentes** = montar; item **inexistente** = escalar) não está escrita. Risco de escalar quando deveria montar, ou vice-versa. *(Conflito parcialmente introduzido pela correção de hoje — precisa de fronteira explícita.)*

- **C3 — Referência órfã.** L51: *"(ver seção VÍDEO DE APRESENTAÇÃO)"* — não existe seção com esse título; o conteúdo do vídeo está no L3. Ponteiro quebrado (sintoma clássico de edição manual acumulada).

### 2.3 Parâmetros de negócio hard-coded no prompt → risco de DRIFT

Números escritos à mão no prompt que **também** vivem no motor (`pricingConfig.policies`). Mudar num lugar e esquecer no outro = a IA fala um número e o PDF mostra outro:

| Parâmetro | No prompt | No motor (fonte de verdade) |
|---|---|---|
| Limiar frete→montagem (R$250) | L40 | `pricingConfig.policies.freightAssemblyThreshold` ([tools.ts:746](../lib/ai-agent/tools.ts#L746)) |
| Desconto à vista (8%) | L44 | `pricingConfig.policies.cashDiscountPct` ([tools.ts:271](../lib/ai-agent/tools.ts#L271), [pricing.ts:149](../lib/ai-agent/pricing.ts#L149)) |
| Desconto de montagem (2 peças −10% / 3+ −13%) | L47, L84 | motor de orçamento |
| Blocos R$35, máx 5 | L56, L66 | opcional no catálogo/motor |
| Cartão 10x, prazo 15 dias | L44, L45 | config de negócio |

### 2.4 Fatos que deviam estar no RAG/catálogo (não no prompt)

- L14 — lista de **tipos de lareira** (em L/de canto/meio de peça; Celine/Vesta/Elite; Prime P/G, Dormente P/G). A *política* ("lareira específica → foto; genérico → catálogo") fica; a **lista** é catálogo.
- L17 — lista de **acessórios da Gourmet** + mapeamento perfil→acessório (pizza→forno; versatilidade→prensa). Política de recomendação fica; **lista/tabela** vira config/RAG.
- L20–21 — medidas por modelo: **já** estão no Conhecimento (o prompt só aponta — correto, manter).
- L64 — garantia/chaminé: **já** no Conhecimento (correto, manter).
- L68 — cidades ≠ POA (Canoas, Gravataí…): o `resolveFreight` já conhece — é dado geográfico, não política.

### 2.5 Oportunidades de estrutura (texto → configuração)

- **Aliases/gatilhos** em prosa ("nunca fui"/"primeira vez" = primeiro contato; "POA" = Porto Alegre) → tabela de sinônimos (config).
- **Mapa perfil→acessório** → tabela.
- **Frases-modelo** (os muitos `ex.: …`) → um banco de exemplos curado, **1 por regra**, não espalhado.

---

## 3. Diagnóstico central

O `customPrompt` mistura **três naturezas de conteúdo** com donos e ciclos de vida diferentes:

1. **POLÍTICA COMPORTAMENTAL** — sempre-ligada (ordem do fluxo, uma pergunta por vez, não inventar, gatear por modelo, blindagem). **Pertence ao prompt.**
2. **PARÂMETROS DE NEGÓCIO** — R$250, 8%, 15 dias, R$35, descontos. **Pertence à config** (fonte única, injetada).
3. **FATOS DE PRODUTO** — medidas, tipos de lareira, lista de acessórios, garantia. **Pertence ao RAG/catálogo** (sob demanda).

O crescimento orgânico é sintoma de **misturar as três numa string editada à mão**. A cura não é "escrever mais enxuto uma vez" (volta a inchar em 3 meses) — é **separar as fontes e compilar**.

---

## 4. A arquitetura: Prompt Compiler

Em vez de um blob editado à mão, o prompt final passa a ser **compilado** a partir de fontes estruturadas, num passo de build determinístico.

### 4.1 Fontes canônicas (as 3 camadas)

1. **Policy modules** — regras comportamentais, cada uma escrita **UMA vez**, organizadas por tópico (identidade · fluxo de abertura · condução · orçamento · mídia · blindagem). Cada módulo é estruturado:
   ```
   { id, topico, prioridade, texto, exemplos: [...], reforco?: bool, conflita_com?: [ids] }
   ```
   `reforco: true` marca uma repetição **deliberada** (ex.: "não invente" na blindagem) — o lint mantém; duplicata acidental o lint remove.

2. **Parameters** — resolvidos em tempo de compilação de `pricingConfig`/`agentConfig`. O texto do módulo usa placeholders (`{{freight_assembly_threshold}}`, `{{cash_discount_pct}}`), **nunca** um número escrito à mão. Fonte única = zero drift.

3. **Knowledge pointers** — o prompt carrega só a **política de quando consultar o Conhecimento**; os **fatos** ficam no RAG (já é assim para medidas/garantia; estender para listas de produto).

### 4.2 O compilador

`compilePrompt(clientId) → { prompt, report }`:

- **Monta:** identidade + policies (ordenadas por tópico/prioridade, dedupe) + parâmetros resolvidos + ponteiros de conhecimento.
- **Lint (falha o build):**
  - **duplicata** — dois módulos com a mesma intenção sem `reforco: true`;
  - **drift** — número literal no texto que casa com um parâmetro conhecido (deveria ser placeholder);
  - **referência órfã** — "ver seção X" sem alvo;
  - **conflito** — dois módulos em `conflita_com` sem uma regra de desempate declarada;
  - **exemplo órfão** — `ex.:` sem regra dona.
- **Report:** tokens por módulo, diff vs última compilação, lints. Observabilidade do prompt (hoje inexistente).

### 4.3 Por que isso é sustentável (o coração do pedido)

- Evolução futura = **mudar um módulo** (ou um parâmetro na config), nunca colar prosa no fim. O compilador dedupe e posiciona.
- Como cada conceito tem **um lar canônico**, o mesmo conceito **não pode** ser repetido acidentalmente — o lint barra.
- Números na config (uma fonte) → **zero drift** entre o que a IA diz e o que o PDF mostra.
- Fatos no RAG → o prompt **não incha com catálogo**.
- O prompt vira **artefato compilado e versionado**, não um documento editado à mão.

### 4.4 Validação (invariante do usuário)

Nenhum prompt compilado vai a produção sem:
1. **Compilar** → gerar o prompt novo;
2. **Simular** as N conversas reais (harness de replay) com temperatura 0;
3. **Comparar** contra o baseline congelado — decisões, tools chamadas, artefatos, nota por dimensão;
4. **Adotar só se preservar** (golden gate verde). Diferença de comportamento = bloqueia adoção.

É essa rede que torna a consolidação **segura**: garante que "reescrever mais enxuto" não mudou o que a IA faz. Sem ela, consolidar seria apostar.

---

## 5. Precisamos de 20k? Resposta direta

**Não.** Estimativa honesta do que dá pra consolidar **sem mudar comportamento**:

- Dedupe das 10 famílias (R1–R10): **−20 a −30%**.
- Listas de produto → RAG/catálogo (lareiras, acessórios): **−5 a −10%**.
- Números → config: pouco em tokens, **enorme em manutenção** (mata o drift).
- Resolver C1/C2: **não reduz tokens — aumenta precisão**.

→ Alvo realista: **~13–15k chars de policy** (de 20,6k), com números e fatos fora.

**Mas o alvo não é um número de tokens — é a arquitetura que impede o crescimento.** Um prompt de 14k bem-compilado (cada regra uma vez, números na config) é sustentável; um de 14k editado à mão volta a 20k em um trimestre.

**Ressalva importante:** o gpt-4o-mini precisa de **explicitude**. Consolidar ≠ espremer. Parte das redundâncias é **reforço intencional** (a blindagem repete "não invente" de propósito porque é crítico). O compilador distingue reforço (`reforco: true`, mantém) de duplicata acidental (remove) — e a **simulação é o juiz final**: se remover um reforço degradar a nota, reverte.

---

## 6. Roadmap (fases isoladas, reversíveis, cada uma validada pela simulação)

| Fase | Objetivo | Risco | Rollback | Critério de adoção |
|---|---|---|---|---|
| **0** | Auditoria (este RFC) + **congelar baseline** de comportamento (rodar a simulação em N conversas, salvar decisões/tools/notas) | nenhum | — | baseline salvo |
| **1** | Extrair **parâmetros** pra config (números → placeholders); compilador resolve | baixo | reverter fonte | simulação: números idênticos, comportamento idêntico |
| **2** | **Modularizar** o blob em módulos por tópico **sem reescrever** (recompila pro mesmo texto) | ~zero (refactor estrutural) | reverter | prompt byte-idêntico OU golden gate verde |
| **3** | **Dedupe** guiado por evidência (R1–R10) → uma regra canônica por conceito | médio | reverter módulo | **cada** consolidação validada pela simulação |
| **4** | Mover **listas** de produto pra RAG/catálogo | médio | reverter | simulação preserva respostas de produto |
| **5** | **Lint no CI** (drift/duplicata/órfão/conflito) — impede regressão arquitetural futura | baixo | desligar lint | build verde |
| **6** | Resolver **conflitos** C1/C2 com fronteiras explícitas | médio | reverter | simulação mostra ganho de precisão sem regressão |

Fases 1–2 são quase sem risco e já entregam observabilidade + fim do drift. O ganho de tokens real está na 3–4. A 5 é o que torna a sustentabilidade **permanente** (não depende de disciplina humana).

---

## 7. Fora de escopo / decisões a confirmar

- **Multi-tenant:** o compilador nasce por-cliente (JR piloto). Módulos comuns vs específicos do cliente = decisão da Fase 2 (provável: base compartilhada + overrides por cliente).
- **Quem edita:** hoje o `customPrompt` é editado direto no banco. O compilador pode ter fonte em arquivos versionados (git) ou numa UI. A decidir na Fase 2.
- **Não** vamos usar LLM para reescrever o prompt (mesma postura do RFC da camada de inteligência: consolidação é determinística e auditável; a simulação valida). LLM, no máximo, sugere candidatos de dedupe para revisão humana.
