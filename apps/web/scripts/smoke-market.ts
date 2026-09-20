// Live smoke test for the Massive market-data client. Run with:
//   MASSIVE_API_KEY=... pnpm --filter web exec tsx scripts/smoke-market.ts
import { createMassiveClient } from "../lib/market/client";
import { getAggregates, getPreviousClose } from "../lib/market/rest/bars";
import { getLastTrade } from "../lib/market/rest/snapshots";
import { getOptionChainSnapshot } from "../lib/market/rest/options";
import { getMarketStatus, usEquitiesOpen } from "../lib/market/rest/market-status";
import { computePlaybit } from "../lib/market/compute/playbit-ema";

async function main() {
  const c = createMassiveClient();

  const status = await getMarketStatus(c);
  console.log("market:", status.market ?? "?", "| open:", usEquitiesOpen(status));

  const prev = await getPreviousClose(c, "AAPL");
  console.log("AAPL prev close:", prev?.c);

  const bars = await getAggregates(c, {
    ticker: "AAPL",
    timespan: "day",
    from: "2024-01-01",
    to: "2026-09-19",
  });
  console.log("AAPL daily bars:", bars.length);

  const pb = computePlaybit(
    bars.map((b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c })),
  );
  const last = pb.at(-1);
  console.log(
    "PlayBit last -> regime:",
    last?.regime,
    "| emaTop:",
    last?.emaTop?.toFixed(2),
    "| emaBot:",
    last?.emaBot?.toFixed(2),
    "| converged:",
    last?.converged,
  );

  const lt = await getLastTrade(c, "AAPL");
  console.log("AAPL last trade:", lt?.p);

  const chain = await getOptionChainSnapshot(c, "AAPL", { limit: 3 });
  console.log(
    "AAPL options sample:",
    chain.length,
    "| first:",
    chain[0]?.details.ticker,
    "| delta:",
    chain[0]?.greeks?.delta?.toFixed(3),
    "| iv:",
    chain[0]?.implied_volatility?.toFixed(3),
  );

  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
