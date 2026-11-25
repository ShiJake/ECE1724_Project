# Backend: Express API + PostgreSQL

TypeScript Express REST API with PostgreSQL through Prisma 7.

## Setup

Needs Node.js 22+ and Docker Desktop.

```bash
cd express
npm install            # also generates the Prisma client
cp .env.example .env   # then set BETTER_AUTH_SECRET and DEMO_USER_PASSWORD
docker compose up -d   # PostgreSQL on localhost:5433, plus a stockwatch_test database
npm run db:migrate     # apply migrations
npm run db:seed        # demo login, 3 watches, 3 days of fake prices
npm run dev            # http://localhost:3000 (API docs at /api/docs)
```

Sign in on the frontend with `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD`, or sign up a new
account.

For live prices and alerts, put a free [Finnhub](https://finnhub.io) key in `FINNHUB_API_KEY`.
Without it the API still works, but prices never update and new tickers aren't checked.
Alert emails also need the `SMTP_*` settings; without them alerts only go to the live stream.
Saving portfolios to DigitalOcean Spaces needs the `DO_SPACES_*` settings; without them the
portfolio routes still work and nothing is saved.

The test database is created by `docker/init-test-db.sql`, which only runs the first time the
volume is created. If you started the container before that file existed, run
`docker compose down -v` and `docker compose up -d` again (this wipes local data).

If Docker won't run, `npx prisma dev` starts a local Postgres instead; point `DATABASE_URL` and
`TEST_DATABASE_URL` at the URL it prints. That database drops connections that overlap, which
shows up as random 500s (login bouncing back to the login page), so also set
`DATABASE_POOL_MAX=1` to make the backend use one connection at a time.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API and restart on file changes |
| `npm start` | Start the API once |
| `npm test` | Run the API tests against `TEST_DATABASE_URL` (wiped between tests) |
| `npm run typecheck` | Type-check everything with `tsc` |
| `npm run db:migrate` | Create/apply migrations after editing `prisma/schema.prisma` |
| `npm run db:seed` | Create the demo login (from `DEMO_USER_*`) and replace its watches |

## CI

Every PR into `main` runs [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) on GitHub:
the backend typecheck and tests against a fresh Postgres, and the frontend lint and build.
CI has no Finnhub key, SMTP or Spaces settings, so tests must use fakes for outside services
instead of calling them. Locally, `npm test` ignores the `FINNHUB_API_KEY` and `DO_SPACES_*`
values in your `.env` for the same reason; a test that needs a Finnhub key sets a fake one with
`vi.stubEnv` and stubs `fetch`.

## API

Interactive docs: `/api/docs` (Swagger UI); raw spec: `/api/openapi.json`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/sign-up/email` | Create an account `{ name, email, password }` and sign in |
| POST | `/api/auth/sign-in/email` | Sign in `{ email, password }`; sets the session cookie |
| POST | `/api/auth/sign-out` | Sign out |
| GET | `/api/auth/get-session` | The signed-in user and session, or `null` |
| GET | `/api/watches` | The signed-in user's watches with current price and % change |
| POST | `/api/watches` | Create a watch `{ ticker, purchasePrice, gainPct, lossPct }` |
| GET | `/api/watches/:id` | One watch |
| PATCH | `/api/watches/:id` | Edit purchase price / thresholds (clears notification status) |
| DELETE | `/api/watches/:id` | Delete a watch |
| GET | `/api/watches/:id/prices` | Price history since the watch was created, oldest first |
| GET | `/api/watches/:id/prices.csv` | The same history as a CSV download (`timestamp,price`) |
| GET | `/api/watches/portfolio.json` | All of the user's watches as a portfolio file download |
| POST | `/api/watches/portfolio/import` | Add the watches from a portfolio file |
| GET | `/api/alerts/stream` | Live gain/loss alerts for the signed-in user (server-sent events) |

The `/api/auth/*` routes come from Better Auth (see [Auth](#auth)) and aren't in the Swagger
docs. Every other route except `/api/health` needs the session cookie and answers 401 without it.

The CSV is built from PostgreSQL on each request, so nothing is stored for it. On the
Watch Details page a plain link works as the download button, since the browser sends the
login cookie with it: `<a href={`/api/watches/${id}/prices.csv`}>Download CSV</a>`.

The portfolio file is
`{ "version": 1, "exportedAt": "...", "watches": [{ ticker, purchasePrice, gainPct, lossPct }] }`.
The import takes that file (or its text as `{ "json": "<file contents>" }`), checks every watch
with the same rules as `POST /api/watches`, and creates them all in one transaction, so a bad
watch means none are added. Existing watches are kept, so importing a file twice makes
duplicates. Imported tickers aren't checked with Finnhub. Both portfolio routes also save the
user's current portfolio to Spaces at `users/<userId>/portfolio.json` when `DO_SPACES_*` is
set; if that upload fails it's logged and the request still succeeds.

Validation (from the proposal): ticker is 1-12 letters, digits, `.` or `-` (upper-cased);
`purchasePrice > 0`; `gainPct > 0`; `lossPct <= 0` (e.g. `-5` means alert at a 5% drop).
When `FINNHUB_API_KEY` is set, a new watch's ticker is also checked with Finnhub: an unknown
ticker gets 400, and 502 means Finnhub couldn't be reached.
Errors are JSON: `{ "error": "..." }`, plus `details` per field for 400s.

## Auth

[Better Auth](https://www.better-auth.com) (`src/lib/better-auth.ts`) handles email/password
sign-up and sign-in, and keeps users and sessions in PostgreSQL through its Prisma adapter.
Signing in sets a session cookie. On every `/api/watches` and `/api/alerts` request,
`requireUser` in `src/auth.ts` looks up the session, answers 401 if there isn't one, and puts
the user's id on `req.userId`; each route then only touches that user's rows. The frontend uses
Better Auth's React client (`react/my-app/src/lib/auth-client.ts`), and the Vite dev server
proxies `/api` to this server, so the browser sees one origin and sends the cookie by itself.

Tests don't sign in for every request: `createApp` takes a `resolveUserId` function, and the
tests pass one that reads an `x-test-user` header. `tests/auth.test.ts` covers the real session
path (sign up, then use the cookie) and the trusted-origin check below.

Better Auth answers 403 when a page on a site it doesn't trust tries to sign up, sign in or
send other auth requests. It trusts the origin of `BETTER_AUTH_URL`, the Vite dev server
(`http://localhost:5173`), and anything listed in `BETTER_AUTH_TRUSTED_ORIGINS`
(comma-separated).

**Deploying:** set `BETTER_AUTH_SECRET` to a new random value and `BETTER_AUTH_URL` to the API's
public URL. The simplest setup serves the frontend and the API from one origin, as the Vite
proxy does locally; then nothing else is needed. A frontend on a different origin also needs
its URL in `BETTER_AUTH_TRUSTED_ORIGINS`, plus CORS and cross-site cookie settings, which the
API doesn't have yet.

## Prices and alerts

`src/pricePoller.ts` runs every 60 seconds while the server is up. For each stock that has at
least one watch it asks Finnhub for the price, updates `Stock.currentPrice`, and adds a
`PriceSnapshot`. Then it checks each watch on that stock: when `% change >= gainPct` or
`% change <= lossPct` it sets `gainNotified` / `lossNotified` and sends the alert once, as an
`alert` event on `/api/alerts/stream` and as an email to the watch owner. Editing a watch clears
both flags, so its alerts can fire again.

Only the server calls Finnhub. The dashboard and Watch Details pages re-fetch from this API
every 10 seconds to show new prices and alert flags. Alerts are also pushed the moment they
happen on `/api/alerts/stream` (`new EventSource("/api/alerts/stream")`), which the frontend
doesn't use yet.

## Database (`prisma/schema.prisma`)

- **User**: Better Auth's user table (name, email), owner of watches.
- **Session / Account / Verification**: Better Auth's tables. `Account` holds the hashed
  password for email/password users.
- **Stock**: one row per ticker, shared by all users, with the latest price.
- **Watch**: a user's purchase price and thresholds for one stock, plus `gainNotified` /
  `lossNotified` so an alert is sent once rather than every poll.
- **PriceSnapshot**: price history for graphs. It lives in PostgreSQL (not Spaces) so each
  poll is one insert and a graph is one indexed query.

## Layout

```
src/
  index.ts            starts the server and the price poller
  app.ts              createApp(): middleware, routes, docs, error handling
  auth.ts             Better Auth session lookup + requireUser middleware
  lib/better-auth.ts  Better Auth config (email/password, trusted origins)
  db.ts               shared Prisma client
  errors.ts           HttpError and the JSON error handler
  openapi.ts          OpenAPI document (request bodies come from the Zod schemas)
  pricePoller.ts      Finnhub price poll, snapshots and threshold checks
  notifications/      SSE alert stream and alert emails
  storage/            portfolio file format, DigitalOcean Spaces uploads, CSV formatting
  watches/            routes, Zod schemas, response shape
prisma/               schema, migrations, seed script
tests/                Vitest + supertest API tests
```

## Next steps

- **Push prices to open pages**: the poller could send a `price` event on the alert stream
  after each update, so pages update right away instead of re-fetching every 10 seconds.
