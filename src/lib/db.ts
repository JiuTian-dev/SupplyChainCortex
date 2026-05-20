import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL || 'postgresql://localhost:5432/test';
  if (base.includes('connection_limit=')) return base;
  const limit = process.env.PRISMA_CONNECTION_LIMIT || '5';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connection_limit=${limit}`;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.DEBUG_PRISMA === '1' ? ['query', 'error', 'warn'] : ['error'],
    adapter: new PrismaPg({ url: buildDatabaseUrl() }),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db