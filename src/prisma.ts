import { withAccelerate } from "@prisma/extension-accelerate"
import { PrismaClient } from "./generated/prisma/client"
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

const connectionString = process.env.DATABASE_URL

const adapter = new PrismaPg({ connectionString })

export const prisma: PrismaClient =
    globalForPrisma.prisma || new PrismaClient({ adapter }).$extends(withAccelerate())

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma