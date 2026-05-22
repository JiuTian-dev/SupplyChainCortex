import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL!;
  if (base.includes('connection_limit=')) return base;
  const limit = process.env.PRISMA_CONNECTION_LIMIT || '5';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connection_limit=${limit}`;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.DEBUG_PRISMA === '1' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: buildDatabaseUrl(),
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
