import type { Stock, Watch } from "../generated/prisma/client";

/** The JSON shape the API returns for a watch, with its stock's latest price. */
export function toWatchResponse(watch: Watch & { stock: Stock }) {
  const { ticker, currentPrice, priceUpdatedAt } = watch.stock;
  const changeAmount = currentPrice === null ? null : currentPrice - watch.purchasePrice;

  return {
    id: watch.id,
    ticker,
    purchasePrice: watch.purchasePrice,
    gainPct: watch.gainPct,
    lossPct: watch.lossPct,
    logoUrl: watch.logoUrl,
    gainNotified: watch.gainNotified,
    lossNotified: watch.lossNotified,
    createdAt: watch.createdAt,
    updatedAt: watch.updatedAt,
    currentPrice,
    priceUpdatedAt,
    /** Per-share gain (+) or loss (-) since purchase; null until the first poll. */
    changeAmount,
    changePct: changeAmount === null ? null : (changeAmount / watch.purchasePrice) * 100,
  };
}
