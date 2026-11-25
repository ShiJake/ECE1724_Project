import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
  secret: process.env["BETTER_AUTH_SECRET"],

  emailAndPassword: {
    enabled: true,
  },

  // Sites allowed to call the auth routes from a browser: BETTER_AUTH_URL's own origin,
  // the Vite dev server, and anything in BETTER_AUTH_TRUSTED_ORIGINS (comma-separated),
  // which Better Auth reads itself. Set that to the frontend's URL when deploying.
  trustedOrigins: ["http://localhost:5173"],

  // Better Auth skips the origin check when NODE_ENV is "test". Keep it on so the
  // tests cover the same check that runs in dev and production.
  advanced: {
    disableOriginCheck: false,
  },
});
