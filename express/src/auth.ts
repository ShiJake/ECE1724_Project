import type { Request, RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./lib/better-auth";
import { HttpError } from "./errors";

/** Finds the signed-in user's id for a request, or null if nobody is signed in. */
export type ResolveUserId = (req: Request) => Promise<string | null>;

/** Resolves the user from the current Better Auth session. */
export const resolveSessionUserId: ResolveUserId = async (req) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  return session?.user.id ?? null;
};


/** Rejects the request with 401 unless a user is signed in; sets req.userId. */
export function requireUser(resolveUserId: ResolveUserId): RequestHandler {
  return async (req, _res, next) => {
    const userId = await resolveUserId(req);
    if (!userId) throw new HttpError(401, "Not signed in");
    req.userId = userId;
    next();
  };
}
