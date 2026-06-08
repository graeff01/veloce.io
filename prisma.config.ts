import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
    // Necessário para `prisma migrate diff --from-migrations` (checagem de drift no CI).
    ...(process.env["SHADOW_DATABASE_URL"] ? { shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] } : {}),
  },
});
