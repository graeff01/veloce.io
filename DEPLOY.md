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
