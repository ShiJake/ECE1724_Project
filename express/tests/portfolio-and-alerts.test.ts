import { S3Client } from "@aws-sdk/client-s3";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { errorHandler } from "../src/errors";
import { watchesRouter } from "../src/watches/routes";
import { prisma } from "../src/db";
import { runPricePoll, type AlertEvent } from "../src/pricePoller";
import { resetDb } from "./helpers";



function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    const headerUserId = req.header("x-user-id") ?? req.header("x-test-user");
    if (headerUserId) {
      (req as express.Request & { userId?: string }).userId = headerUserId;
    }
    next();
  });
  testApp.use("/api/watches", watchesRouter);
  testApp.use(errorHandler);
  return testApp;
}

function asUser(testApp: express.Express, userId: string) {
  return {
    get: (url: string) => request(testApp).get(url).set("x-user-id", userId),
    post: (url: string) => request(testApp).post(url).set("x-user-id", userId),
    patch: (url: string) => request(testApp).patch(url).set("x-user-id", userId),
    delete: (url: string) => request(testApp).delete(url).set("x-user-id", userId),
  };
}

function enableMockSpacesConfig() {
  vi.stubEnv("DO_SPACES_ENDPOINT", "https://tor1.digitaloceanspaces.com");
  vi.stubEnv("DO_SPACES_REGION", "tor1");
  vi.stubEnv("DO_SPACES_BUCKET", "test-bucket");
  vi.stubEnv("DO_SPACES_ACCESS_KEY", "test-key");
  vi.stubEnv("DO_SPACES_SECRET_KEY", "test-secret");
}

describe("Portfolio export, import, prices.csv, and alert recipient behavior", () => {
  const testApp = createTestApp();
  

  beforeEach(async () => {
    await resetDb();
    
  });

  afterEach(() => {
    
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("exports user portfolio JSON from GET /api/watches/portfolio.json", async () => {
    const userId = "portfolio-export-user";
    await prisma.user.upsert({
      where: { id: userId },
      update: { email: "exporter@example.com", name: "Exporter User" },
      create: { id: userId, email: "exporter@example.com", name: "Exporter User" },
    });

    await asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "AAPL", purchasePrice: 180, gainPct: 10, lossPct: -5 })
      .expect(201);

    const res = await asUser(testApp, userId)
      .get("/api/watches/portfolio.json")
      .expect(200);

    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.json).toBeUndefined();
    expect(res.body.version).toBe(1);
    expect(typeof res.body.exportedAt).toBe("string");
    expect(Array.isArray(res.body.watches)).toBe(true);
    expect(res.body.watches).toEqual(
      expect.arrayContaining([
        {
          ticker: "AAPL",
          purchasePrice: 180,
          gainPct: 10,
          lossPct: -5,
        },
      ]),
    );
  });

  it("syncs portfolio to Spaces on watch create, update, delete, import, and export under Option 1", async () => {
    enableMockSpacesConfig();
    const sendSpy = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const userId = "spaces-timing-user";

    await prisma.user.upsert({
      where: { id: userId },
      update: { email: "timing@example.com", name: "Timing User" },
      create: { id: userId, email: "timing@example.com", name: "Timing User" },
    });

    const created = await asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "AAPL", purchasePrice: 150, gainPct: 10, lossPct: -5 })
      .expect(201);

    expect(sendSpy).toHaveBeenCalledTimes(1);

    await asUser(testApp, userId)
      .patch(`/api/watches/${created.body.id}`)
      .send({ gainPct: 20 })
      .expect(200);

    expect(sendSpy).toHaveBeenCalledTimes(2);

    await asUser(testApp, userId)
      .get("/api/watches/portfolio.json")
      .expect(200);

    expect(sendSpy).toHaveBeenCalledTimes(3);

    await asUser(testApp, userId)
      .post("/api/watches/portfolio/import")
      .send({
        version: 1,
        watches: [{ ticker: "MSFT", purchasePrice: 400, gainPct: 12, lossPct: -6 }],
      })
      .expect(201);

     expect(sendSpy).toHaveBeenCalledTimes(4);

    await asUser(testApp, userId)
      .delete(`/api/watches/${created.body.id}`)
      .expect(204);

    expect(sendSpy).toHaveBeenCalledTimes(5);
  });

  it("does not return 500 when Spaces fails during export, import, or delete", async () => {
    enableMockSpacesConfig();
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(new Error("Spaces unavailable"));
    const userId = "spaces-outage-user";

    await prisma.user.upsert({
      where: { id: userId },
      update: { email: "outage@example.com", name: "Outage User" },
      create: { id: userId, email: "outage@example.com", name: "Outage User" },
    });

    const created = await asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "AAPL", purchasePrice: 150, gainPct: 10, lossPct: -5 })
      .expect(201);

    await asUser(testApp, userId)
      .get("/api/watches/portfolio.json")
      .expect(200);

    await asUser(testApp, userId)
      .post("/api/watches/portfolio/import")
      .send({
        version: 1,
        watches: [{ ticker: "MSFT", purchasePrice: 400, gainPct: 12, lossPct: -6 }],
      })
      .expect(201);

    await asUser(testApp, userId)
      .delete(`/api/watches/${created.body.id}`)
      .expect(204);
  });

  it("imports valid watches via POST /api/watches/portfolio/import and rejects invalid payloads with structured Zod details", async () => {
    const userId = "portfolio-import-user";
    await prisma.user.upsert({
      where: { id: userId },
      update: { email: "importer@example.com", name: "Importer User" },
      create: { id: userId, email: "importer@example.com", name: "Importer User" },
    });

    const invalidRes = await asUser(testApp, userId)
      .post("/api/watches/portfolio/import")
      .send({ version: 1, watches: [] })
      .expect(400);

    expect(invalidRes.body).toBeDefined();

    const badItemRes = await asUser(testApp, userId)
      .post("/api/watches/portfolio/import")
      .send({
        version: 1,
        watches: [
          { ticker: "TOOLONGTICKER123", purchasePrice: -10, gainPct: 8, lossPct: 5 },
        ],
      })
      .expect(400);

    expect(badItemRes.body.error).toBe("Validation failed");
    expect(Array.isArray(badItemRes.body.details)).toBe(true);
    expect(badItemRes.body.details.length).toBeGreaterThan(0);

    const validRes = await asUser(testApp, userId)
      .post("/api/watches/portfolio/import")
      .send({
        version: 1,
        watches: [
          { ticker: "brk.b", purchasePrice: 410, gainPct: 8, lossPct: -4 },
          { ticker: "NVDA-1", purchasePrice: 120, gainPct: 15, lossPct: 0 },
        ],
      })
      .expect(201);

    expect(Array.isArray(validRes.body)).toBe(true);
    expect(validRes.body).toHaveLength(2);
    expect(validRes.body.map((w: { ticker: string }) => w.ticker)).toEqual([
      "BRK.B",
      "NVDA-1",
    ]);
  });

  it("serves CSV price history from GET /api/watches/:id/prices.csv and hides another user's watch", async () => {
    const ownerId = "csv-owner-user";
    const otherUserId = "csv-other-user";

    await prisma.user.upsert({
      where: { id: ownerId },
      update: { email: "owner@example.com", name: "Owner User" },
      create: { id: ownerId, email: "owner@example.com", name: "Owner User" },
    });
    await prisma.user.upsert({
      where: { id: otherUserId },
      update: { email: "other@example.com", name: "Other User" },
      create: { id: otherUserId, email: "other@example.com", name: "Other User" },
    });

    const created = await asUser(testApp, ownerId)
      .post("/api/watches")
      .send({ ticker: "AAPL", purchasePrice: 150, gainPct: 10, lossPct: -5 })
      .expect(201);

    const watchId = created.body.id as number;
    expect(watchId).toBeDefined();

    const csvRes = await asUser(testApp, ownerId)
      .get(`/api/watches/${watchId}/prices.csv`)
      .expect(200);

    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.headers["content-disposition"]).toContain("AAPL-prices.csv");
    expect(csvRes.text.split("\n")[0]?.trim()).toBe("timestamp,price");

    await asUser(testApp, otherUserId)
      .get(`/api/watches/${watchId}/prices.csv`)
      .expect(404);
  });

  it("passes the watch owner's database email as userEmail on triggered gain alerts", async () => {
    const ownerEmail = "custom-owner@example.com";
    const userId = "alert-recipient-user";

    await prisma.user.upsert({
      where: { id: userId },
      update: { email: ownerEmail, name: "Alert User" },
      create: { id: userId, email: ownerEmail, name: "Alert User" },
    });

    const created = await asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "TSLA", purchasePrice: 100, gainPct: 10, lossPct: -5 })
      .expect(201);

    const watchId = created.body.id as number;

    vi.stubEnv("FINNHUB_API_KEY", "test-finnhub-key");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ c: 120 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const alerts: AlertEvent[] = [];
    await runPricePoll(async (event) => {
      alerts.push(event);
    });

    const matchingAlert = alerts.find((a) => a.watchId === watchId);
    expect(matchingAlert).toBeDefined();
    expect(matchingAlert?.userEmail).toBe(ownerEmail);
  });

  it("starts with blank DO_SPACES_* env vars by default from vitest.config.ts", () => { // Verifies test isolation blanks out DO_SPACES_* env vars so tests do not hit Spaces by default.
    expect(process.env["DO_SPACES_ENDPOINT"]).toBe("");
    expect(process.env["DO_SPACES_REGION"]).toBe("");
    expect(process.env["DO_SPACES_BUCKET"]).toBe("");
    expect(process.env["DO_SPACES_ACCESS_KEY"]).toBe("");
    expect(process.env["DO_SPACES_SECRET_KEY"]).toBe("");
  });

  it("does not call Spaces during runPricePoll even when DO_SPACES_* env vars are set", async () => { // Verifies price polling stays Postgres-only and never writes or reads Spaces when Spaces env vars are configured.
    enableMockSpacesConfig();
    const sendSpy = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const userId = "poller-spaces-user";

    await prisma.user.upsert({
      where: { id: userId },
      update: { email: "poller@example.com", name: "Poller User" },
      create: { id: userId, email: "poller@example.com", name: "Poller User" },
    });

    await asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "AAPL", purchasePrice: 100, gainPct: 10, lossPct: -5 })
      .expect(201);

    sendSpy.mockClear();

    vi.stubEnv("FINNHUB_API_KEY", "test-finnhub-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ c: 105 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await runPricePoll(async () => {});

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("syncs portfolio to Spaces on watch create, update, delete, import, and export under Option 1", async () => {
    enableMockSpacesConfig();
    const sendSpy = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const userId = "option1-sync-user";

    await prisma.user.upsert({
      where: { id: userId },
      update: { email: "option1@example.com", name: "Option 1 User" },
      create: { id: userId, email: "option1@example.com", name: "Option 1 User" },
    });

    const created = await asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "AAPL", purchasePrice: 150, gainPct: 10, lossPct: -5 })
      .expect(201);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    await asUser(testApp, userId)
      .patch(`/api/watches/${created.body.id}`)
      .send({ gainPct: 20 })
      .expect(200);
    expect(sendSpy).toHaveBeenCalledTimes(2);

    await asUser(testApp, userId)
      .get("/api/watches/portfolio.json")
      .expect(200);
    expect(sendSpy).toHaveBeenCalledTimes(3);

    await asUser(testApp, userId)
      .post("/api/watches/portfolio/import")
      .send({
        version: 1,
        watches: [{ ticker: "MSFT", purchasePrice: 400, gainPct: 12, lossPct: -6 }],
      })
      .expect(201);
    expect(sendSpy).toHaveBeenCalledTimes(4);

    await asUser(testApp, userId)
      .delete(`/api/watches/${created.body.id}`)
      .expect(204);
    expect(sendSpy).toHaveBeenCalledTimes(5);
  });

  it("keeps database and export truthful even when Spaces uploads finish out of order", async () => {
    enableMockSpacesConfig();
    const userId = "race-check-user";

    await prisma.user.upsert({
      where: { id: userId },
      update: { email: "race@example.com", name: "Race User" },
      create: { id: userId, email: "race@example.com", name: "Race User" },
    });

    const tsla = await asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "TSLA", purchasePrice: 250, gainPct: 15, lossPct: -8 })
      .expect(201);

    let releaseFirstUpload!: () => void;
    const firstUploadGate = new Promise<void>((resolve) => {
      releaseFirstUpload = resolve;
    });

    let sendCalls = 0;
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async () => {
      sendCalls += 1;
      if (sendCalls === 1) {
        await firstUploadGate;
      }
      return {} as never;
    });

    const addNvdaPromise = asUser(testApp, userId)
      .post("/api/watches")
      .send({ ticker: "NVDA", purchasePrice: 120, gainPct: 10, lossPct: -5 });

    const deleteTslaPromise = asUser(testApp, userId)
      .delete(`/api/watches/${tsla.body.id}`);
    
    const [addRes, deleteRes] = await Promise.all([
      addNvdaPromise,
      deleteTslaPromise,
      (async () => {
        await new Promise((r) => setTimeout(r, 20));
        releaseFirstUpload();
      })(),
    ]);

  
    expect(addRes.status).toBe(201);
    expect(deleteRes.status).toBe(204);

    const listRes = await asUser(testApp, userId).get("/api/watches").expect(200);
    expect(listRes.body.map((w: { ticker: string }) => w.ticker)).toEqual(["NVDA"]);

    const secondDeleteRes = await asUser(testApp, userId).delete(`/api/watches/${tsla.body.id}`);
    expect(secondDeleteRes.status).toBe(404);

    const importRes = await asUser(testApp, userId)
      .post("/api/watches/portfolio/import")
      .send({
        version: 1,
        watches: [{ ticker: "AAPL", purchasePrice: 180, gainPct: 10, lossPct: -5 }],
      })
      .expect(201);
    expect(importRes.body.map((w: { ticker: string }) => w.ticker)).toEqual(["AAPL"]);

    const exportRes = await asUser(testApp, userId)
      .get("/api/watches/portfolio.json")
      .expect(200);
    expect(exportRes.body.watches.map((w: { ticker: string }) => w.ticker)).toEqual([
      "AAPL",
      "NVDA",
    ]);
  });
});