import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/client/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
