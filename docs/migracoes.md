# Migrações — fonte única da verdade

A pasta `prisma/migrations` é a **única fonte da verdade** do schema. Produção aplica
exatamente essas migrações no boot (`db:migrate` → `prisma migrate deploy`).

## Regras
1. **Toda mudança de schema vira uma migração.** Edite `schema.prisma` e gere a migração:
   ```
   npm run db:migrate:dev      # prisma migrate dev — cria e aplica a migração
   ```
2. **`db push` é proibido para mudanças de schema** que vão para produção. Ele não gera
   histórico e mascara perdas de dados (já vimos falso-positivo de "data loss" em mudança
   puramente aditiva). Use só para experimentos locais descartáveis.
3. **Nunca edite uma migração já mergeada.** Crie uma nova.
4. **Antes de abrir PR / no CI**, verifique que não há drift entre schema e o banco:
   ```
   npm run db:check            # falha (exit 2) se schema ≠ datasource
   ```
   Para validar que as migrações reproduzem o schema (replay), configure
   `SHADOW_DATABASE_URL` e rode:
   ```
   prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
   ```

## Aplicar uma migração a um banco existente (sem db push)
```
cat prisma/migrations/<nome>/migration.sql | npx prisma db execute --stdin
```

## Produção (Railway)
O start roda `db:migrate` (`prisma migrate deploy`). Migrações são idempotentes e aplicadas
em ordem. Se uma migração falhar, o deploy não sobe — investigue, **não** contorne com `db push`.
