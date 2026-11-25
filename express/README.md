# Backend: Express API + PostgreSQL

TypeScript Express REST API with PostgreSQL through Prisma 7.

## Setup

Needs Node.js 22+ and Docker Desktop.

```bash
cd express
npm install            # also generates the Prisma client
cp .env.example .env
docker compose up -d   # PostgreSQL on localhost:5433, plus a stockwatch_test database
npm run db:migrate     # apply migrations
npm run db:seed        # demo user, 3 watches, 3 days of fake prices
npm run dev            # http://localhost:3000 (API docs at /api/docs)
```

For live prices and alerts, put a free [Finnhub](https://finnhub.io) key in `FINNHUB_API_KEY`.
Without it the API still works, but prices never update and new tickers aren't checked.
Alert emails also need the `SMTP_*` settings; without them alerts only go to the live stream.

The test database is created by `docker/init-test-db.sql`, which only runs the first time the
volume is created. If you started the container before that file existed, run
`docker compose down -v` and `docker compose up -d` again (this wipes local data).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API and restart on file changes |
| `npm start` | Start the API once |
| `npm test` | Run the API tests against `TEST_DATABASE_URL` (wiped between tests) |
| `npm run typecheck` | Type-check everything with `tsc` |
| `npm run db:migrate` | Create/apply migrations after editing `prisma/schema.prisma` |
| `npm run db:seed` | Replace the demo data |

## CI

Every PR into `main` runs [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) on GitHub:
the backend typecheck and tests against a fresh Postgres, and the frontend lint and build.
CI has no Finnhub key or SMTP settings, so tests must use fakes for outside services instead
of calling them. Locally, `npm test` ignores the `FINNHUB_API_KEY` in your `.env` for the same
reason; a test that needs one sets a fake key with `vi.stubEnv` and stubs `fetch`.

## API

Interactive docs: `/api/docs` (Swagger UI); raw spec: `/api/openapi.json`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/watches` | The signed-in user's watches with current price and % change |
| POST | `/api/watches` | Create a watch `{ ticker, purchasePrice, gainPct, lossPct }` |
| GET | `/api/watches/:id` | One watch |
| PATCH | `/api/watches/:id` | Edit purchase price / thresholds (clears notification status) |
| DELETE | `/api/watches/:id` | Delete a watch |
| GET | `/api/watches/:id/prices` | Price history since the watch was created, oldest first |
| GET | `/api/watches/:id/prices.csv` | The same history as a CSV download (`timestamp,price`) |
| GET | `/api/alerts/stream` | Live gain/loss alerts for the signed-in user (server-sent events) |

The CSV is built from PostgreSQL on each request, so nothing is stored for it. On the
Watch Details page a plain link works as the download button, since the browser sends the
login cookie with it: `<a href={`/api/watches/${id}/prices.csv`}>Download CSV</a>`.

Validation (from the proposal): ticker is 1-12 letters, digits, `.` or `-` (upper-cased);
`purchasePrice > 0`; `gainPct > 0`; `lossPct <= 0` (e.g. `-5` means alert at a 5% drop).
When `FINNHUB_API_KEY` is set, a new watch's ticker is also checked with Finnhub: an unknown
ticker gets 400, and 502 means Finnhub couldn't be reached.
Errors are JSON: `{ "error": "..." }`, plus `details` per field for 400s.

## Prices and alerts

`src/pricePoller.ts` runs every 60 seconds while the server is up. For each stock that has at
least one watch it asks Finnhub for the price, updates `Stock.currentPrice`, and adds a
`PriceSnapshot`. Then it checks each watch on that stock: when `% change >= gainPct` or
`% change <= lossPct` it sets `gainNotified` / `lossNotified` and sends the alert once, as an
`alert` event on `/api/alerts/stream` and as an email to the watch owner. Editing a watch clears
both flags, so its alerts can fire again.

Polling Finnhub is server side only. The browser never polls: it keeps one SSE connection open
(`new EventSource("/api/alerts/stream")`) and gets alerts pushed as they happen.

## Database (`prisma/schema.prisma`)

- **User**: core fields in Better Auth's shape.
- **Stock**: one row per ticker, shared by all users, with the latest price.
- **Watch**: a user's purchase price and thresholds for one stock, plus `gainNotified` /
  `lossNotified` so an alert is sent once rather than every poll.
- **PriceSnapshot**: price history for graphs. It lives in PostgreSQL (not Spaces) so each
  poll is one insert and a graph is one indexed query.

## Layout

```
src/
  index.ts            starts the server
  app.ts              createApp(): middleware, routes, docs, error handling
  auth.ts             Better Auth session lookup + requireUser middleware
  db.ts               shared Prisma client
  errors.ts           HttpError and the JSON error handler
  openapi.ts          OpenAPI document (request bodies come from the Zod schemas)
  pricePoller.ts      Finnhub price poll, snapshots and threshold checks
  notifications/      SSE alert stream and alert emails
  watches/            routes, Zod schemas, response shape
prisma/               schema, migrations, seed script
tests/                Vitest + supertest API tests
```

## Where the other parts plug in

- **Better Auth**: handles email/password signup and login, stores sessions using the
  Prisma adapter, and protects user-specific API routes through session-based authentication.
- **Cloud storage**: add a `File` model (owner, Spaces key, filename, type) with a migration.
- **Live prices on the dashboard**: the poller can send a `price` event on the same stream
  after each update, so open pages refresh without reloading.
