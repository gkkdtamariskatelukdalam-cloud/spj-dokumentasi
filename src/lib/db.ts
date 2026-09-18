import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// In development: log all queries for debugging
// In production: only log errors (prevent log bloat on Vercel)
const logLevel = process.env.NODE_ENV === 'production'
  ? (['error'] as const)
  : (['query', 'error'] as const)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevel,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
