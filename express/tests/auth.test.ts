import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSessionUserId } from "../src/auth";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp({ resolveUserId: resolveSessionUserId });

describe("Better Auth session authentication", () => {
  const email = `auth-test-${randomUUID()}@example.com`;

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it("allows a newly signed-up user to access their watches with the session cookie", async () => {
    const signup = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Origin", "http://localhost:5173")
      .send({
        name: "Auth Test User",
        email,
        password: "TestPassword123!",
      });

    expect(signup.status).toBe(200);

    const setCookies = signup.headers["set-cookie"];
    const cookieValues: string[] =
      typeof setCookies === "string" ? [setCookies] : (setCookies ?? []);

    expect(cookieValues.length).toBeGreaterThan(0);

    const cookieHeader = cookieValues
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

    const watches = await request(app)
      .get("/api/watches")
      .set("Cookie", cookieHeader);

    expect(watches.status).toBe(200);
    expect(watches.body).toEqual([]);
  });
});

describe("trusted origins", () => {
  const email = `origin-test-${randomUUID()}@example.com`;
  const deployedSite = "https://stockwatch.example.com";

  const signUpFrom = (origin: string) =>
    request(app)
      .post("/api/auth/sign-up/email")
      .set("Origin", origin)
      .send({ name: "Origin Test User", email, password: "TestPassword123!" });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { email } });
  });

  it("rejects sign-up from a site that isn't trusted", async () => {
    const res = await signUpFrom(deployedSite);
    expect(res.status).toBe(403);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("trusts the sites listed in BETTER_AUTH_TRUSTED_ORIGINS", async () => {
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", `https://other.example.com,${deployedSite}`);
    const res = await signUpFrom(deployedSite);
    expect(res.status).toBe(200);
  });

  it("trusts the Vite dev server by default", async () => {
    const res = await signUpFrom("http://localhost:5173");
    expect(res.status).toBe(200);
  });
});
