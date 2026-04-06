import { PrismaClient } from '@/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as { prisma: InstanceType<typeof PrismaClient> };

function createPrisma() {
  const url = process.env.TURSO_DATABASE_URL || `file:${require('path').resolve(process.cwd(), 'dev.db')}`;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  const adapter = new PrismaLibSql(
    authToken ? { url, authToken } : { url }
  );
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrisma();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
