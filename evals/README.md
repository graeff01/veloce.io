# Golden dataset — avaliação da IA (F0)

Bateria de testes de **comportamento** da IA. Cada arquivo em `cases/` é um conjunto
de casos versionados (o "golden dataset"): entrada + contexto + comportamento
esperado. Como ficam desacoplados de qualquer execução, dá pra rerodar os mesmos
casos a cada mudança de prompt/modelo e comparar — é o que transforma "achamos que
melhorou" em **teste de regressão**.

## Como roda

Os casos passam pelo **mesmo orquestrador** de produção em modo `test` (não grava,
não envia, memória efêmera), contra a **config real de um cliente**. Aplica-se:

1. **Asserções determinísticas** (baratas, sempre): decisão registrada, ferramentas
   usadas/não usadas, regex proibido/obrigatório na resposta, não-bloqueio pelo guardrail.
2. **Juiz LLM** (opcional, qualitativo): um modelo mais forte julga a `rubrica` do caso.
   Só roda se houver `OPENAI_API_KEY`.

## Uso

```bash
# requer DATABASE_URL (config do cliente) e, para o juiz, OPENAI_API_KEY
AI_EVAL_CLIENT_ID=<clientId> npx tsx scripts/run-evals.ts
# ou
npx tsx scripts/run-evals.ts --client <clientId> --judge gpt-4o
npx tsx scripts/run-evals.ts --client <clientId> --no-judge   # só determinístico
npx tsx scripts/run-evals.ts --client <clientId> --json        # saída p/ CI
```

Sai com código `1` se qualquer caso falhar → serve de **gate**: nada sobe se regrediu.

## Escrevendo um caso

```jsonc
{
  "id": "identificador-curto",
  "descricao": "o que este caso trava",
  "vertical": "geral",                 // informativo
  "historico": [                        // opcional: conversa anterior (memória efêmera)
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "mensagem": "última mensagem do lead",
  "espera": {
    "decisao": ["escalou", "respondeu_duvida"],  // decisão aceitável
    "usaFerramenta": ["buscar_estoque"],          // DEVE chamar
    "naoUsaFerramenta": ["marcar_visita"],        // NÃO pode chamar
    "proibido": ["fa[cz]o por r\\$"],             // regex que NÃO pode aparecer
    "obrigatorio": ["vendedor"],                   // regex que DEVE aparecer
    "naoPodeBloquear": true,                        // não pode cair no guardrail
    "rubrica": "critério qualitativo p/ o juiz LLM"
  }
}
```

Os casos deste diretório são **agnósticos de vertical** de propósito (ex: "nunca
inventar preço", "não negociar desconto"), então valem para qualquer cliente. Casos
específicos de um cliente/nicho podem ser adicionados aqui conforme necessário.
