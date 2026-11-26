import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { app, asUser, createUser, resetDb } from "./helpers";

const ALICE = "alice";
const BOB = "bob";

const validWatch = { ticker: "AAPL", purchasePrice: 200, gainPct: 10, lossPct: -5 };

beforeEach(async () => {
  await resetDb();
  await createUser(ALICE);
  await createUser(BOB);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("authentication", () => {
  it("rejects requests without a signed-in user", async () => {
    const res = await request(app).get("/api/watches");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Not signed in" });
  });
});

describe("POST /api/watches", () => {
  it("creates a watch for the signed-in user", async () => {
    const res = await asUser(ALICE).post("/api/watches").send(validWatch);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticker: "AAPL",
      purchasePrice: 200,
      gainPct: 10,
      lossPct: -5,
      gainNotified: false,
      lossNotified: false,
      currentPrice: null,
      changePct: null,
    });
    const saved = await prisma.watch.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved.userId).toBe(ALICE);
  });

  it("normalizes the ticker to trimmed upper case", async () => {
    const res = await asUser(ALICE)
      .post("/api/watches")
      .send({ ...validWatch, ticker: "  brk.b " });
    expect(res.status).toBe(201);
    expect(res.body.ticker).toBe("BRK.B");
  });

  it("shares one Stock row between users watching the same ticker", async () => {
    await asUser(ALICE).post("/api/watches").send(validWatch);
    await asUser(BOB).post("/api/watches").send(validWatch);
    expect(await prisma.stock.count({ where: { ticker: "AAPL" } })).toBe(1);
    expect(await prisma.watch.count()).toBe(2);
  });

  it("accepts a loss threshold of exactly 0", async () => {
    const res = await asUser(ALICE).post("/api/watches").send({ ...validWatch, lossPct: 0 });
    expect(res.status).toBe(201);
  });

  it("creates a watch without calling Finnhub when FINNHUB_API_KEY is unset", async () => {
    const previousKey = process.env["FINNHUB_API_KEY"];
    delete process.env["FINNHUB_API_KEY"];

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Finnhub fetch should not be called without FINNHUB_API_KEY"));

    try {
      const res = await asUser(ALICE).post("/api/watches").send(validWatch);

      expect(res.status).toBe(201);
      expect(res.body.ticker).toBe("AAPL");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (previousKey === undefined) {
        delete process.env["FINNHUB_API_KEY"];
      } else {
        process.env["FINNHUB_API_KEY"] = previousKey;
      }
    }
  });

  it.each([
    ["a non-positive purchase price", { purchasePrice: 0 }],
    ["a non-positive gain threshold", { gainPct: 0 }],
    ["a positive loss threshold", { lossPct: 1 }],
    ["an empty ticker", { ticker: "   " }],
    ["a ticker with invalid characters", { ticker: "AA PL" }],
    ["a ticker longer than 12 characters", { ticker: "ABCDEFGHIJKLM" }],
    ["a missing field", { gainPct: undefined }],
  ])("rejects %s", async (_label, override) => {
    const res = await asUser(ALICE)
      .post("/api/watches")
      .send({ ...validWatch, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details.length).toBeGreaterThan(0);
  });
});

describe("POST /api/watches ticker check (FINNHUB_API_KEY set)", () => {
  beforeEach(() => {
    vi.stubEnv("FINNHUB_API_KEY", "test-finnhub-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Fakes Finnhub's quote endpoint so no test calls the real one. */
  function stubFinnhub(response: Response | Error) {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    if (response instanceof Error) fetchSpy.mockRejectedValue(response);
    else fetchSpy.mockResolvedValue(response);
    return fetchSpy;
  }

  it("creates the watch when Finnhub knows the ticker", async () => {
    const fetchSpy = stubFinnhub(Response.json({ c: 231.5, pc: 230 }));

    const res = await asUser(ALICE)
      .post("/api/watches")
      .send({ ...validWatch, ticker: " brk.b " });

    expect(res.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(url.searchParams.get("symbol")).toBe("BRK.B");
    expect(url.searchParams.get("token")).toBe("test-finnhub-key");
  });

  it("rejects a ticker Finnhub doesn't know with 400 and saves nothing", async () => {
    stubFinnhub(Response.json({ c: 0, pc: 0 }));

    const res = await asUser(ALICE).post("/api/watches").send({ ...validWatch, ticker: "ZZZZ" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Unknown ticker: ZZZZ" });
    expect(await prisma.watch.count()).toBe(0);
    expect(await prisma.stock.count()).toBe(0);
  });

  it.each([
    ["answers with an error status", new Response("rate limited", { status: 429 })],
    ["can't be reached", new TypeError("fetch failed")],
  ])("returns 502 and saves nothing when Finnhub %s", async (_label, response) => {
    stubFinnhub(response);

    const res = await asUser(ALICE).post("/api/watches").send(validWatch);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Failed to verify ticker with Finnhub" });
    expect(await prisma.watch.count()).toBe(0);
  });
});

describe("GET /api/watches", () => {
  it("lists only the signed-in user's watches, sorted by ticker", async () => {
    await asUser(ALICE).post("/api/watches").send({ ...validWatch, ticker: "MSFT" });
    await asUser(ALICE).post("/api/watches").send(validWatch);
    await asUser(BOB).post("/api/watches").send({ ...validWatch, ticker: "NVDA" });

    const res = await asUser(ALICE).get("/api/watches");

    expect(res.status).toBe(200);
    expect(res.body.map((w: { ticker: string }) => w.ticker)).toEqual(["AAPL", "MSFT"]);
  });

  it("includes the current price and the change from the purchase price", async () => {
    await asUser(ALICE).post("/api/watches").send(validWatch);
    await prisma.stock.update({
      where: { ticker: "AAPL" },
      data: { currentPrice: 230, priceUpdatedAt: new Date() },
    });

    const res = await asUser(ALICE).get("/api/watches");

    expect(res.body[0]).toMatchObject({
      currentPrice: 230,
      changeAmount: 30,
      changePct: 15,
    });
    expect(typeof res.body[0].priceUpdatedAt).toBe("string");
  });
});

describe("DELETE /api/watches/:id", () => {
  it("deletes a watch, removes it from the list, and returns 404 on a second delete", async () => {
    const created = await asUser(ALICE).post("/api/watches").send(validWatch);
    expect(created.status).toBe(201);

    const firstDelete = await asUser(ALICE).delete(`/api/watches/${created.body.id}`);
    expect(firstDelete.status).toBe(204);

    const listAfterDelete = await asUser(ALICE).get("/api/watches");
    expect(listAfterDelete.status).toBe(200);
    expect(listAfterDelete.body).toEqual([]);

    const secondDelete = await asUser(ALICE).delete(`/api/watches/${created.body.id}`);
    expect(secondDelete.status).toBe(404);
  });
});
