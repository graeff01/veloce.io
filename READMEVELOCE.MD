# README — VELOCE OPS

## VISÃO DO PRODUTO

O VELOCE OPS é uma plataforma interna de operação para agência digital.

O sistema NÃO é:

* ERP
* CRM genérico
* dashboard corporativo tradicional
* sistema financeiro
* Trello clone
* admin panel comum

O sistema existe para:

* organizar a operação da agência
* reduzir caos operacional
* aumentar previsibilidade
* reduzir dependência do gestor
* escalar clientes sem perder qualidade

O foco do produto é:
clareza operacional, velocidade e execução.

---

# DIRETRIZ PRINCIPAL

Toda feature deve responder:

* isso reduz esforço mental?
* isso reduz perda operacional?
* isso aumenta clareza?
* isso acelera execução?

Se não:
NÃO IMPLEMENTAR.

---

# PRINCÍPIOS DO VELOCE OPS

1. Clareza acima de estética
   O sistema deve ser bonito, mas nunca sacrificar clareza operacional.

2. Menos elementos, mais contexto
   Poucos elementos visuais, mas cada um com significado real.

3. Velocidade é UX
   Tudo deve exigir o menor número possível de cliques e esforço mental.

4. A interface deve desaparecer
   O usuário deve focar na operação, não na ferramenta.

5. Sofisticação silenciosa
   O sistema deve transmitir qualidade sem exagero visual.

6. Contexto operacional é prioridade
   O sistema deve sempre mostrar o que importa agora.

7. Não adicionar complexidade sem necessidade
   Toda nova funcionalidade precisa justificar sua existência operacionalmente.

---

# IDENTIDADE DO PRODUTO

O sistema deve transmitir:

* sofisticação silenciosa
* profundidade visual
* fluidez operacional
* sensação premium
* minimalismo moderno
* foco total em operação

O sistema NÃO deve parecer:

* template SaaS genérico
* dashboard empresarial
* painel administrativo comum

---

# REFERÊNCIAS VISUAIS

As principais referências do produto são:

* Linear
* Plane
* Notion
* Height
* Raycast

Inspirar:

* densidade inteligente
* minimalismo premium
* motion refinado
* foco operacional
* tipografia limpa
* profundidade visual

---

# REGRAS DE DESIGN

## NÃO UTILIZAR

* gráficos desnecessários
* widgets decorativos
* dashboards poluídos
* excesso de cards
* excesso de cores
* gradientes exagerados
* sombras pesadas
* efeitos chamativos
* UI “cara de IA”
* componentes gigantes
* bordas agressivas

---

# VISUAL

O sistema deve ser:

* clean
* elegante
* denso
* moderno
* silencioso visualmente

Dark mode deve usar:

* profundidade
* camadas
* superfícies
* contraste suave

Nunca usar:

* preto puro absoluto
* branco puro agressivo

---

# TOKENS VISUAIS

Base atual do dark mode:

--bg-base: #0B1020
--bg-surface: #111827
--bg-sidebar: #0F172A
--bg-hover: #1E293B

Bordas:
rgba(255,255,255,0.06)

O sistema deve sempre manter:

* hierarquia de profundidade
* separação de superfícies
* consistência visual

---

# SISTEMA VISUAL

Produto premium exige consistência invisível.
O usuário não precisa perceber conscientemente os padrões, mas deve sentir que a interface é refinada, previsível e bem acabada.

## Spacing system

Usar uma escala curta e consistente:

* 4px — micro ajustes, espaçamento entre ícones e labels
* 8px — espaçamento interno mínimo, gaps compactos
* 12px — espaçamento entre controles próximos
* 16px — padding padrão de componentes e grupos
* 24px — separação entre blocos relacionados
* 32px — separação entre seções
* 48px — respiro estrutural entre áreas principais

Evitar valores aleatórios fora da escala.
Só usar exceções quando houver uma necessidade visual clara e repetível.

## Radius

Raios devem ser suaves, modernos e consistentes:

* inputs: 10px
* buttons: 10px
* cards: 14px
* panels: 16px
* modals: 18px
* pills/badges: 999px

Evitar cantos agressivos ou excessivamente arredondados em superfícies grandes.

## Shadows

Sombras devem criar profundidade discreta, não efeito decorativo.

* surface subtle: 0 1px 2px rgba(0,0,0,0.18)
* surface elevated: 0 8px 24px rgba(0,0,0,0.22)
* modal/dropdown: 0 18px 48px rgba(0,0,0,0.32)
* focus ring: 0 0 0 3px rgba(59,130,246,0.22)

Em dark mode, priorizar contraste de superfície, borda e camada antes de sombra pesada.

## Motion

Motion deve reforçar estado, continuidade e fluidez operacional.

* hover: 150ms ease-out
* press/tap: 100ms ease-out
* opening: 180ms ease-out
* closing: 140ms ease-in
* drag: resposta imediata, sem atraso perceptível
* transições de estado: 150ms–220ms

Easing padrão:

* ease-out para entrada e hover
* ease-in para saída
* cubic-bezier(0.2, 0.8, 0.2, 1) para painéis, drawers e modais

Evitar animações longas, elásticas ou chamativas.
Nenhuma animação deve atrasar a execução.

## Tipografia

A tipografia deve favorecer leitura rápida, densidade e hierarquia operacional.

Escala base:

* caption: 11px / 16px
* label: 12px / 16px
* body small: 13px / 20px
* body: 14px / 22px
* body large: 16px / 24px
* section title: 18px / 26px
* page title: 24px / 32px

Pesos:

* regular: 400
* medium: 500
* semibold: 600
* bold: usar raramente

Opacidade em dark mode:

* texto principal: rgba(255,255,255,0.92)
* texto secundário: rgba(255,255,255,0.68)
* texto terciário: rgba(255,255,255,0.48)
* texto desabilitado: rgba(255,255,255,0.32)

Evitar títulos grandes demais dentro de painéis, cards, listas e áreas operacionais densas.

---

# ESTRUTURA DO SISTEMA

O sistema é centrado em CLIENTES.

Cada cliente possui:

* operação própria
* tarefas
* calendário
* timeline
* pendências
* contexto operacional

---

# FUNCIONALIDADES IMPLEMENTADAS

## Estrutura operacional

* Clientes
* Planos
* Itens do plano
* Tarefas
* Checklists
* Execution logs

---

# Fluxo operacional

Status globais:

* A fazer
* Em andamento
* Revisão
* Concluído

Toda tarefa deve possuir:

* responsável
* prazo
* cliente
* prioridade
* contexto

---

# Funcionalidades já implementadas

* Kanban operacional
* Calendário mensal
* Timeline do cliente
* Health score operacional
* Centro de pendências
* Prioridade de tarefas
* Bloqueios operacionais
* Templates inteligentes
* Busca
* Modo foco
* Dark mode refinado
* Logs operacionais
* Sidebar refinada
* Quick actions
* Activity feed

---

# REGRAS DE UX

A experiência deve priorizar:

* rapidez
* fluidez
* baixa fricção
* poucos cliques
* foco operacional

O usuário deve sentir:

* controle
* clareza
* leveza operacional

---

# MOTION

As animações devem ser:

* rápidas
* suaves
* discretas

Duração ideal:
150ms–220ms

Utilizar motion em:

* hover
* abertura lateral
* drag
* transições
* estados

Nunca exagerar.

---

# O QUE EVITAR NO PRODUTO

NÃO implementar agora:

* automações excessivas
* IA invasiva
* dashboards analíticos
* módulos financeiros complexos
* chat interno
* notificações exageradas
* excesso de permissões
* excesso de configurações

---

# FOCO REAL DO PRODUTO

O produto é:
uma central operacional premium para gestão interna da agência.

O objetivo final é:
permitir escalar clientes com organização, velocidade e qualidade operacional.

---

# DIRETRIZ PARA NOVAS IMPLEMENTAÇÕES

Sempre priorizar:

1. Clareza operacional
2. Velocidade
3. Contexto
4. Fluidez
5. Consistência visual
6. Redução de ruído

Antes de implementar qualquer feature:
questionar se ela melhora a operação ou apenas adiciona complexidade.

---

# IMPORTANTE

Antes de criar qualquer funcionalidade nova:

* analisar a arquitetura atual
* verificar consistência visual
* manter identidade do produto
* validar impacto operacional
* evitar poluição

Se houver dúvidas sobre UX, design ou arquitetura:
perguntar antes de implementar.
