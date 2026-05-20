import "dotenv/config";
import { defineConfig, env } from "prisma/config";

function buildUrl(): string {
  const base = process.env.DATABASE_URL || "postgresql://localhost:5432/test";
  if (base.includes("connection_limit=")) return base;
  const limit = process.env.PRISMA_CONNECTION_LIMIT || "5";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connection_limit=${limit}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: buildUrl(),
  },
  migrations: {
    path: "prisma/migrations",
  },
});
