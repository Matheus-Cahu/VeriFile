// O banco pertence à plataforma web-ssiaas: este backend só gera o client a
// partir de uma cópia do schema. Migrações continuam sendo feitas no web-ssiaas.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
