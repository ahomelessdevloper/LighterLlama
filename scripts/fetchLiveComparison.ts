import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFeeSummary, fetchLatestTvl, fetchRevenueSummary } from "./api/defiLlama";
import { fetchHyperliquidLiveMetrics } from "./api/hyperliquidLive";
import { fetchLighterLiveMetrics } from "./api/lighterLive";
import { buildValuationRatioCharts } from "./api/valuationHistory";
import { fetchValuationSnapshot } from "./api/valuation";
import type {
  LiveComparisonPayload,
  StatValue,
  TimeSeriesPoint,
  ValuationMetrics,
} from "../src/types/liveStats";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, "public", "live-comparison.json");

function stat(
  label: string,
  lighter: number | null,
  hyperliquid: number | null,
  format: StatValue["format"] = "currency"
): StatValue {
  return { label, lighter, hyperliquid, format };
}

function mergeFeeCharts(
  lighterChart: Array<[number, number]>,
  hyperliquidChart: Array<[number, number]>
): TimeSeriesPoint[] {
  const lighterMap = new Map(lighterChart);
  const timestamps = new Set<number>([
    ...lighterChart.map(([timestamp]) => timestamp),
    ...hyperliquidChart.map(([timestamp]) => timestamp),
  ]);

  return [...timestamps]
    .sort((a, b) => a - b)
    .slice(-30)
    .map((timestamp) => ({
      timestamp,
      lighter: lighterMap.get(timestamp) ?? null,
      hyperliquid: hyperliquidChart.find(([ts]) => ts === timestamp)?.[1] ?? null,
    }));
}

async function main(): Promise<void> {
  console.log("Fetching live Lighter vs Hyperliquid comparison...");

  const [
    lighterLive,
    hyperliquidLive,
    lighterFees,
    hyperliquidFees,
    lighterRevenue,
    hyperliquidRevenue,
    lighterTvl,
    hyperliquidTvl,
  ] = await Promise.all([
    fetchLighterLiveMetrics(),
    fetchHyperliquidLiveMetrics(),
    fetchFeeSummary("lighter"),
    fetchFeeSummary("hyperliquid"),
    fetchRevenueSummary("lighter"),
    fetchRevenueSummary("hyperliquid"),
    fetchLatestTvl("lighter"),
    fetchLatestTvl("hyperliquid"),
  ]);

  const [lighterVal, hyperliquidVal] = await Promise.all([
    fetchValuationSnapshot("lighter", lighterFees.total30d, lighterRevenue?.total30d ?? null),
    fetchValuationSnapshot(
      "hyperliquid",
      hyperliquidFees.total30d,
      hyperliquidRevenue?.total30d ?? null
    ),
  ]);

  const valuation: ValuationMetrics = {
    market_cap: stat("Market Cap", lighterVal.marketCap, hyperliquidVal.marketCap),
    fdv: stat("FDV", lighterVal.fdv, hyperliquidVal.fdv),
    pf_mcap: stat("PF (Market Cap)", lighterVal.pfMarketCap, hyperliquidVal.pfMarketCap, "ratio"),
    pf_fdv: stat("PF (FDV)", lighterVal.pfFdv, hyperliquidVal.pfFdv, "ratio"),
    pe_mcap: stat("PE (Market Cap)", lighterVal.peMarketCap, hyperliquidVal.peMarketCap, "ratio"),
    pe_fdv: stat("PE (FDV)", lighterVal.peFdv, hyperliquidVal.peFdv, "ratio"),
  };

  const valuation_charts = await buildValuationRatioCharts({
    lighterFeesChart: lighterFees.totalDataChart,
    hyperliquidFeesChart: hyperliquidFees.totalDataChart,
    lighterRevenueChart: lighterRevenue?.totalDataChart ?? null,
    hyperliquidRevenueChart: hyperliquidRevenue?.totalDataChart ?? null,
    lighterSnapshot: lighterVal,
    hyperliquidSnapshot: hyperliquidVal,
  });

  const payload: LiveComparisonPayload = {
    updated_at: new Date().toISOString(),
    sources: {
      lighter: [
        ...lighterLive.sources,
        "api.llama.fi/summary/fees/lighter",
        "api.llama.fi/protocol/lighter",
        "api.coingecko.com/api/v3/coins/lighter",
      ],
      hyperliquid: [
        ...hyperliquidLive.sources,
        "api.llama.fi/summary/fees/hyperliquid",
        "api.llama.fi/protocol/hyperliquid",
        "api.coingecko.com/api/v3/coins/hyperliquid",
      ],
    },
    valuation,
    valuation_charts,
    headline: [
      stat("24h Volume", lighterLive.dailyVolumeUsd, hyperliquidLive.dailyVolumeUsd),
      stat("Open Interest", lighterLive.openInterestUsd, hyperliquidLive.openInterestUsd),
      stat("24h Fees", lighterFees.total24h, hyperliquidFees.total24h),
      stat("7d Fees", lighterFees.total7d, hyperliquidFees.total7d),
      stat("30d Fees", lighterFees.total30d, hyperliquidFees.total30d),
      stat("All-time Fees", lighterFees.totalAllTime, hyperliquidFees.totalAllTime),
      stat("TVL", lighterTvl, hyperliquidTvl),
      stat("Active Markets", lighterLive.markets, hyperliquidLive.markets, "number"),
      stat("Total Users", null, hyperliquidLive.totalUsers, "compact"),
      stat("Total Deposits", null, hyperliquidLive.totalDeposits),
      stat("Total Withdrawals", null, hyperliquidLive.totalWithdrawals),
      stat("Total Notional Liquidated", null, hyperliquidLive.totalNotionalLiquidated),
    ],
    volume_chart: mergeFeeCharts(lighterFees.totalDataChart, hyperliquidFees.totalDataChart),
    notes: [
      "PF = valuation / trailing 30d annualized fees. PE = valuation / trailing 30d annualized revenue (fees used if revenue unavailable).",
      "PE/PF line charts use CoinGecko daily market cap and DefiLlama fee history. FDV trend scales market cap by current FDV/MC ratio.",
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Saved live comparison to ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        lighter24hVolume: lighterLive.dailyVolumeUsd,
        hyperliquid24hVolume: hyperliquidLive.dailyVolumeUsd,
        lighterOI: lighterLive.openInterestUsd,
        hyperliquidOI: hyperliquidLive.openInterestUsd,
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Failed to build live comparison:", message);
  process.exit(1);
});