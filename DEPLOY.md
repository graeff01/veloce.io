# Deploy na Railway

## Pré-requisitos
- Conta no [Railway](https://railway.app)
- Repositório Git (GitHub ou GitLab)

## Passo a passo

### 1. Subir código para o GitHub
```bash
git init
git add .
git commit -m "feat: veloce.io initial release"
git remote add origin https://github.com/seu-usuario/veloce-io.git
git push -u origin main
```

### 2. Criar projeto no Railway
1. Acesse railway.app → New Project
2. Clique em "Deploy from GitHub repo"
3. Selecione o repositório

### 3. Adicionar banco de dados PostgreSQL
1. No projeto Railway, clique em "+ New"
2. Selecione "Database" → "Add PostgreSQL"
3. O Railway adiciona automaticamente a variável `DATABASE_URL`

### 4. Configurar variáveis de ambiente
No painel do serviço web, vá em "Variables" e adicione:

```
DATABASE_URL    → (já preenchido pelo plugin PostgreSQL)
NEXTAUTH_SECRET → (gere com: openssl rand -base64 32)
NEXTAUTH_URL    → https://seu-app.railway.app
```

### 5. Rodar migrations e seed
No terminal da Railway (ou localmente com a DATABASE_URL do Railway):

```bash
# Rodar migrations
npx prisma migrate deploy

# Popular com dados de exemplo
npm run db:seed
```

### 6. Deploy automático
A cada push para a branch main, a Railway faz deploy automático.

---

## Credenciais padrão (após seed)

| Email | Senha | Função |
|-------|-------|--------|
| admin@veloce.io | admin123 | Administrador |
| ops@veloce.io | ops123 | Operacional |

⚠️ **Troque as senhas após o primeiro login!**

---

## Desenvolvimento local

```bash
# Instalar dependências
npm install

# Configurar .env com banco local
cp .env.example .env
# Edite DATABASE_URL com sua conexão local

# Rodar migrations
npx prisma db push

# Popular banco
npm run db:seed

# Iniciar servidor de desenvolvimento
npm run dev
```

Acesse: http://localhost:3000

## Rotina da IA (o que rodar, quando e por quê)

Duas coisas que só funcionam se forem hábito. Ambas leem produção; nenhuma altera
configuração de cliente.

### Toda semana — como a IA está se comportando

```bash
railway run --service Postgres bash -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL"; \
  npm run ia:relatorio -- --dias 7 --cliente jr'
```

Mostra o que as camadas de proteção acionaram: clichê cortado, pedido de licença
que virou envio, capacidade errada barrada, aviso obrigatório acrescentado,
abstenção por dado sem fonte.

**Como ler:** `naturalidade:*` e `roteador:*` subindo NÃO é ruim — é a camada
corrigindo o modelo antes de chegar ao lead. O que merece olhar é **abstenção**
acima de ~10%: costuma ser acervo faltando, não modelo ruim. E taxa importa mais
que contagem.

O motivo de existir: sem isso, um falso positivo (frase boa cortada por engano) só
aparece como reclamação de cliente, semanas depois, sem ninguém ligar as pontas.

### Depois de MEXER na IA — a bateria de ponta a ponta

Obrigatória depois de tocar em `naturalidade.ts`, `queue.ts`, `roteador.ts`,
`orchestrator.ts` ou nas ferramentas.

```bash
railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
  export DATABASE_URL=\"$DATABASE_PUBLIC_URL\"; npm run ia:qa -- battery"'
```

Injeta mensagens assinadas no webhook REAL com número FALSO (faixa não alocada: o
Graph recusa o envio e ninguém real é tocado) e lê o que a IA gerou de verdade.
Cada cenário limpa o que criou.

- `battery` — os cenários inócuos (o padrão)
- `full` — inclui os que **notificam a equipe** (escalação cria Task; orçamento
  entra na fila de revisão do portal). A limpeza apaga o registro, mas a
  notificação já saiu. Rodar é escolha consciente.
- `ORC`, `FILA`, `NAT`… — qualquer argumento filtra por prefixo de id, para
  repetir um cenário sozinho sem pagar a bateria inteira.

**Três armadilhas, todas já pagas nesta casa:**

1. **Espere o deploy.** A bateria testa o que está NO AR. O script compara
   `/api/health` → `version` com o HEAD local e avisa se divergir — sem isso, um
   ❌ de deploy pendente parece defeito e manda investigar o que já estava certo.
2. **Quando passar, leia as respostas.** Três cenários já deram verde sem testar
   nada, por critério que não casava o defeito (o do PDF passava sem o orçamento
   ser gerado).
3. **Depois de merge por squash, o branch morre.** Trabalho novo sai de `master`
   atualizado; continuar no branch mergeado faz o push ir para o vazio e o código
   nunca chegar a produção.

### Validação offline (mais barata, não substitui)

`npm run ia:replay` não existe de propósito: o replay
(`scripts/jr-simulation.ts`) roda o orquestrador em `mode:"test"` e **não alcança
a fila nem o caminho live do PDF**. Serve para comportamento de conversa, contra
conversas reais, e é onde vale rodar antes de subir. Ver
`scripts/jr-simulation.ts` para os parâmetros.
