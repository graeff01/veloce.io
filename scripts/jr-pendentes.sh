#!/usr/bin/env bash
# Tudo que está pendente de gravar no banco da JR, na ORDEM certa.
#
# POR QUE UM SCRIPT SÓ. São cinco gravações de PRs diferentes (#278, #280, #282 e
# a troca de tabela de nov/2026), e a ordem importa: a troca de tabela tem que
# vir ANTES do acervo dos conjuntos — senão ela leria o R$ 4.111 novo da Prime 7 +
# Napoli como o velho da Prime 9 + Napoli. (Ela também pula trechos marcados
# "nov/2026", mas a ordem certa não depende só disso.)
#
# Todos são idempotentes: rodar de novo não estraga nada.
#
# PRÉ-REQUISITOS: (1) o deploy da master no ar — o roteador confere se produção
# entende os campos das regras; (2) crédito na OpenAI — o acervo precisa de
# embedding. Sem crédito, o script para no começo, antes de gravar qualquer coisa.
#
# Uso (sem --commit só MOSTRA o que faria):
#   railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
#     export DATABASE_URL=\$DATABASE_PUBLIC_URL; bash scripts/jr-pendentes.sh"'
#   ...confira a saída, e de novo com --commit no fim.
set -euo pipefail
cd "$(dirname "$0")/.."
COMMIT="${1:-}"
[ -n "$COMMIT" ] && [ "$COMMIT" != "--commit" ] && { echo "uso: jr-pendentes.sh [--commit]"; exit 1; }

: "${DATABASE_URL:?DATABASE_URL ausente — rode via railway run (ver o topo do arquivo)}"
: "${OPENAI_API_KEY:?OPENAI_API_KEY ausente — rode via railway run --service veloce.io}"

echo "── crédito na OpenAI"
status=$(curl -s -o /tmp/jr-pendentes-openai.json -w '%{http_code}' https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-3-small","input":"teste"}')
if [ "$status" != "200" ]; then
  echo "   ✗ OpenAI respondeu $status: $(head -c 300 /tmp/jr-pendentes-openai.json)"
  echo "   Sem crédito o acervo não grava. Coloque crédito e rode de novo — nada foi alterado."
  exit 1
fi
echo "   ✓ ok"

passo() { echo; echo "════ $1"; shift; npx tsx "$@" $COMMIT; }

passo "1/5  Tabela de preços nov/2026 (orçamento, cadastro, acervo e preços revogados)" scripts/jr-tabela-nov2026.ts
passo "2/5  Acervo da Maria (03/11): taxonomia da Prime e medida de conjunto"          scripts/jr-acervo-maria-nov.ts
passo "3/5  Acervo dos conjuntos (04/11): Iglu, Trio, preço próprio de conjunto"      scripts/jr-acervo-conjuntos.ts
passo "4/5  Frete: Lomba do Pinheiro como zona própria (R\$ 250)"                    scripts/jr-frete-lomba.ts

echo; echo "════ 5/5  Regras do roteador (inclui \"pediu vendedor → escala\")"
if [ "$COMMIT" = "--commit" ]; then
  git fetch -q origin master   # o script confere os campos contra origin/master
  mkdir -p "$HOME/Downloads"   # ele guarda ali um backup das rules antes de gravar
  npx tsx scripts/jr-roteador-aplicar.ts
else
  echo "   (só grava com --commit; não tem modo de conferência)"
fi

echo; echo "Fim.${COMMIT:+ Tudo gravado.}${COMMIT:- Nada foi gravado — confira e rode com --commit.}"
