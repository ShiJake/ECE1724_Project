import "dotenv/config";
import { createApp } from "./app";
import { resolveSessionUserId } from "./auth";
import { startPricePoller } from "./pricePoller";
import { broadcastAlertSse } from "./notifications/sse";
import { sendThresholdAlertEmail } from "./notifications/email";

const port = Number(process.env["PORT"] ?? 3000);

createApp({
  resolveUserId: resolveSessionUserId,
}).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

startPricePoller({
  intervalMs: 60_000,
  onAlert: async (event) => {
    console.log("Threshold alert triggered:", event);

    broadcastAlertSse(event);

    const results = await Promise.allSettled([sendThresholdAlertEmail(event)]);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Email alert failed:", result.reason);
      }
    }
  },
});
