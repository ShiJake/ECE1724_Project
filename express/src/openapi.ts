import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { portfolioExportSchema } from "./storage/portfolio";
import { createWatchSchema, updateWatchSchema, watchIdSchema } from "./watches/schemas";


// Request bodies reuse the exact Zod schemas the routes validate with, so the
// docs can't drift from the real rules. Response shapes are described here.
// `.meta({ id })` names a schema so it appears under components/schemas.
const registry = new OpenAPIRegistry();

const CreateWatch = createWatchSchema.meta({ id: "CreateWatch" });
const UpdateWatch = updateWatchSchema.meta({ id: "UpdateWatch" });
const Portfolio = portfolioExportSchema.meta({ id: "Portfolio" });

const Watch = z
  .object({
    id: z.number().int(),
    ticker: z.string(),
    purchasePrice: z.number(),
    gainPct: z.number(),
    lossPct: z.number(),
    gainNotified: z.boolean().meta({ description: "Gain alert already sent" }),
    lossNotified: z.boolean().meta({ description: "Loss alert already sent" }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    currentPrice: z.number().nullable().meta({ description: "Null until the first poll" }),
    priceUpdatedAt: z.iso.datetime().nullable(),
    changeAmount: z.number().nullable().meta({ description: "Per-share change since purchase" }),
    changePct: z.number().nullable().meta({ description: "Percent change since purchase" }),
  })
  .meta({ id: "Watch" });

const PricePoint = z
  .object({ price: z.number(), timestamp: z.iso.datetime() })
  .meta({ id: "PricePoint" });

const ErrorBody = z.object({ error: z.string() }).meta({ id: "Error" });

const ValidationError = z
  .object({
    error: z.literal("Validation failed"),
    details: z.array(z.object({ path: z.string(), message: z.string() })),
  })
  .meta({ id: "ValidationError" });

const json = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });
const idParams = z.object({ id: watchIdSchema });

const errors = {
  401: { description: "Not signed in", content: json(ErrorBody) },
  404: { description: "Watch not found or owned by another user", content: json(ErrorBody) },
  400: { description: "Invalid input", content: json(ValidationError) },
};

registry.registerPath({
  method: "get",
  path: "/api/watches",
  tags: ["Watches"],
  summary: "List the signed-in user's watches, sorted by ticker",
  responses: {
    200: { description: "Watches", content: json(z.array(Watch)) },
    401: errors[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/watches",
  tags: ["Watches"],
  summary: "Create a watch",
  request: { body: { content: json(CreateWatch) } },
  responses: {
    201: { description: "Created watch", content: json(Watch) },
    400: errors[400],
    401: errors[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/watches/{id}",
  tags: ["Watches"],
  summary: "Get one watch",
  request: { params: idParams },
  responses: {
    200: { description: "Watch", content: json(Watch) },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/watches/{id}",
  tags: ["Watches"],
  summary: "Edit purchase price or thresholds (clears notification status)",
  request: { params: idParams, body: { content: json(UpdateWatch) } },
  responses: {
    200: { description: "Updated watch", content: json(Watch) },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/watches/{id}",
  tags: ["Watches"],
  summary: "Delete a watch",
  request: { params: idParams },
  responses: {
    204: { description: "Deleted" },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/watches/{id}/prices",
  tags: ["Watches"],
  summary: "Price history of the watch's stock since the watch was created",
  request: { params: idParams },
  responses: {
    200: { description: "Price points, oldest first", content: json(z.array(PricePoint)) },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/watches/{id}/prices.csv",
  tags: ["Watches"],
  summary: "Download the same price history as a CSV file",
  request: { params: idParams },
  responses: {
    200: {
      description: "CSV file named `<TICKER>-prices.csv`, oldest row first",
      content: {
        "text/csv": {
          schema: z.string().meta({
            example: "timestamp,price\n2026-11-10T16:00:00.000Z,231.5\n",
          }),
        },
      },
    },
    400: errors[400],
    401: errors[401],
    404: errors[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/watches/portfolio.json",
  tags: ["Portfolio"],
  summary: "Download all of the user's watches as a portfolio file",
  description:
    "Returns `portfolio.json` as a download. When the `DO_SPACES_*` settings are set, a copy " +
    "is also saved to DigitalOcean Spaces at `users/<userId>/portfolio.json`; if that upload " +
    "fails, the download still works.",
  responses: {
    200: { description: "Portfolio file", content: json(Portfolio) },
    401: errors[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/watches/portfolio/import",
  tags: ["Portfolio"],
  summary: "Add every watch in a portfolio file to the user's watches",
  description:
    "Takes the file from the download endpoint. The text of the file can also be sent as " +
    "`{ \"json\": \"<file contents>\" }`. Each watch is validated like `POST /api/watches`, and " +
    "they are all created together or not at all. Existing watches are kept.",
  request: { body: { content: json(Portfolio) } },
  responses: {
    201: { description: "The watches that were created", content: json(z.array(Watch)) },
    400: {
      description: "Invalid file, invalid watch, or no watches",
      content: json(z.union([ValidationError, ErrorBody])),
    },
    401: errors[401],
  },
});

const alertStreamExample = [
  "event: connected",
  'data: {"userId":"demo-user","connectedAt":"2026-11-23T15:00:00.000Z"}',
  "",
  "event: alert",
  'data: {"type":"gain","watchId":1,"userId":"demo-user","userEmail":"demo@example.com",' +
    '"ticker":"AAPL","currentPrice":231.5,"purchasePrice":200,"changePct":15.75}',
  "",
  "",
].join("\n");

registry.registerPath({
  method: "get",
  path: "/api/alerts/stream",
  tags: ["Alerts"],
  summary: "Live stream of the signed-in user's gain/loss alerts (server-sent events)",
  description:
    "Stays open. Sends `connected` once, then an `alert` event each time the price poller " +
    "crosses one of the user's thresholds (once per threshold until the watch is edited), " +
    "and a `: ping` comment every 25 seconds. In the browser: `new EventSource(\"/api/alerts/stream\")`.",
  responses: {
    200: {
      description: "Event stream",
      content: { "text/event-stream": { schema: z.string().meta({ example: alertStreamExample }) } },
    },
    401: errors[401],
  },
});

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Stock Watch API",
      version: "0.1.0",
      description:
        "REST API for stock watches. Every /api/watches and /api/alerts route requires a " +
        "signed-in user and only returns that user's data. Sign in with Better Auth at " +
        "`POST /api/auth/sign-in/email` (`{ email, password }`); the browser then sends the " +
        "session cookie with each request.",
    },
  });
}
