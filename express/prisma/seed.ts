// Demo data so the frontend can be built before auth and the poller exist.
// Run with `npm run db:seed`; safe to re-run (it replaces the demo data).
import { auth } from "../src/lib/better-auth";
import { prisma } from "../src/db";

const DEMO_USER_EMAIL = process.env["DEMO_USER_EMAIL"] ?? "demo-login@example.com";
const DEMO_USER_PASSWORD = process.env["DEMO_USER_PASSWORD"];

// Starting prices for the fake history; not real quotes.
const STOCKS = [
  { ticker: "AAPL", start: 228 },
  { ticker: "MSFT", start: 415 },
  { ticker: "NVDA", start: 135 },
];

const WATCHES = [
  { ticker: "AAPL", purchasePrice: 220, gainPct: 10, lossPct: -5 },
  { ticker: "MSFT", purchasePrice: 430, gainPct: 8, lossPct: -4 },
  { ticker: "NVDA", purchasePrice: 120, gainPct: 15, lossPct: 0 },
];

const HISTORY_DAYS = 3;
const STEP_MINUTES = 15;

/** Random walk of `count` prices starting at `start`, moving up to ±0.4% per step. */
function randomWalk(start: number, count: number): number[] {
  const prices: number[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    price *= 1 + (Math.random() - 0.5) * 0.008;
    prices.push(Math.round(price * 100) / 100);
  }
  return prices;
}

async function getDemoUserId(): Promise<string> {
  if (!DEMO_USER_PASSWORD) {
    throw new Error("DEMO_USER_PASSWORD must be set before running the seed.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
  });

  if (existingUser) {
    const credentialAccount = await prisma.account.findFirst({
      where: {
        userId: existingUser.id,
        providerId: "credential",
      },
    });

    if (!credentialAccount) {
      throw new Error(
        `User ${DEMO_USER_EMAIL} exists but has no Better Auth password account.`,
      );
    }

    return existingUser.id;
  }

  const result = await auth.api.signUpEmail({
    body: {
      name: "Demo User",
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
    },
  });

  return result.user.id;
}

async function main() {
  const demoUserId = await getDemoUserId();

  await prisma.watch.deleteMany({ where: { userId: demoUserId } });

  const steps = (HISTORY_DAYS * 24 * 60) / STEP_MINUTES;
  const now = Date.now();

  for (const { ticker, start } of STOCKS) {
    const prices = randomWalk(start, steps);
    const last = prices[prices.length - 1] ?? start;

    const stock = await prisma.stock.upsert({
      where: { ticker },
      update: { currentPrice: last, priceUpdatedAt: new Date(now) },
      create: { ticker, currentPrice: last, priceUpdatedAt: new Date(now) },
    });

    await prisma.priceSnapshot.deleteMany({ where: { stockId: stock.id } });
    await prisma.priceSnapshot.createMany({
      data: prices.map((price, i) => ({
        stockId: stock.id,
        price,
        timestamp: new Date(now - (steps - 1 - i) * STEP_MINUTES * 60_000),
      })),
    });
  }

  // Backdate the watches so the whole fake history counts as "since creation".
  const historyStart = new Date(now - HISTORY_DAYS * 24 * 60 * 60_000);
  for (const { ticker, ...watch } of WATCHES) {
    await prisma.watch.create({
      data: {
        ...watch,
        createdAt: historyStart,
        user: { connect: { id: demoUserId } },
        stock: { connect: { ticker } },
      },
    });
  }

  console.log(
    `Seeded user "${DEMO_USER_EMAIL}" (ID: ${demoUserId}) with ${WATCHES.length} watches and ${steps} price points per stock.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
