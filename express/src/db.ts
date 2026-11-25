import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

// Prisma migrate reads `?schema=` from the URL, but the pg driver adapter
// needs it passed separately, so split it out here to keep both in sync.
const url = new URL(databaseUrl);
const schema = url.searchParams.get("schema") ?? undefined;
url.searchParams.delete("schema");

// The `npx prisma dev` database drops connections that overlap, so set
// DATABASE_POOL_MAX=1 there to make queries take turns on one connection.
// When it's unset, pg's default pool size is used.
const poolMax = Number(process.env["DATABASE_POOL_MAX"]) || undefined;

/** The single Prisma client shared by the whole backend. */
export const prisma = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: url.toString(), max: poolMax },
    schema ? { schema } : {},
  ),
});
