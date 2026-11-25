import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./helpers";

describe("API documentation", () => {
  it("serves an OpenAPI document covering every endpoint", async () => {
    const res = await request(app).get("/api/openapi.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    const methods = (path: string) => Object.keys(res.body.paths[path] ?? {}).sort();
    expect(methods("/api/watches")).toEqual(["get", "post"]);
    expect(methods("/api/watches/{id}")).toEqual(["delete", "get", "patch"]);
    expect(methods("/api/watches/{id}/prices")).toEqual(["get"]);
    expect(methods("/api/watches/{id}/prices.csv")).toEqual(["get"]);
    expect(methods("/api/watches/portfolio.json")).toEqual(["get"]);
    expect(methods("/api/watches/portfolio/import")).toEqual(["post"]);
    expect(methods("/api/alerts/stream")).toEqual(["get"]);
  });

  it("documents the portfolio download and import with one shared schema", async () => {
    const res = await request(app).get("/api/openapi.json");
    const download = res.body.paths["/api/watches/portfolio.json"]?.get?.responses?.["200"];
    const upload = res.body.paths["/api/watches/portfolio/import"]?.post?.requestBody;
    const ref = { $ref: "#/components/schemas/Portfolio" };
    expect(download?.content?.["application/json"]?.schema).toEqual(ref);
    expect(upload?.content?.["application/json"]?.schema).toEqual(ref);
    expect(res.body.components.schemas.Portfolio.required).toContain("watches");
  });

  it("documents the alert stream as server-sent events", async () => {
    const res = await request(app).get("/api/openapi.json");
    const ok = res.body.paths["/api/alerts/stream"]?.get?.responses?.["200"];
    expect(Object.keys(ok?.content ?? {})).toEqual(["text/event-stream"]);
  });

  it("documents the CSV download as text/csv", async () => {
    const res = await request(app).get("/api/openapi.json");
    const ok = res.body.paths["/api/watches/{id}/prices.csv"]?.get?.responses?.["200"];
    expect(Object.keys(ok?.content ?? {})).toEqual(["text/csv"]);
  });

  it("documents request bodies from the same Zod schemas used for validation", async () => {
    const res = await request(app).get("/api/openapi.json");
    const body = res.body.components.schemas.CreateWatch;
    expect(body.required.sort()).toEqual(["gainPct", "lossPct", "purchasePrice", "ticker"]);
  });

  it("serves Swagger UI at /api/docs", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });
});
