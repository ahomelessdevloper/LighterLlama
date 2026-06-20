import {
  HYPERLIQUID_STATS_ENDPOINTS,
  type HyperliquidStatsEndpoint,
} from "./hyperliquidStatsEndpoints";

const INFO_URL = "https://api.hyperliquid.xyz/info";

export interface HyperliquidLiveMetrics {
  markets: number;
  openInterestUsd: number;
  dailyVolumeUsd: number;
  dailyTrades: number | null;
  totalUsers: number | null;
  totalDeposits: number | null;
  totalWithdrawals: number | null;
  totalNotionalLiquidated: number | null;
  totalUsdVolume: number | null;
  sources: string[];
}

interface AssetContext {
  openInterest?: string;
  dayNtlVlm?: string;
  markPx?: string;
  oraclePx?: string;
}

async function fetchThunderheadMetric(
  baseUrl: string,
  endpoint: HyperliquidStatsEndpoint
): Promise<number | null> {
  const path = HYPERLIQUID_STATS_ENDPOINTS[endpoint];
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) return null;

  const data = (await response.json()) as Record<string, number>;
  return data[endpoint] ?? data.total ?? Object.values(data)[0] ?? null;
}

export async function fetchHyperliquidLiveMetrics(): Promise<HyperliquidLiveMetrics> {
  const sources = ["api.hyperliquid.xyz/info (metaAndAssetCtxs)"];
  const statsApi = process.env.HYPERLIQUID_STATS_API_URL?.replace(/\/$/, "");

  const infoResponse = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });

  if (!infoResponse.ok) {
    throw new Error(`Hyperliquid info API failed (${infoResponse.status})`);
  }

  const [, contexts] = (await infoResponse.json()) as [unknown, AssetContext[]];

  const openInterestUsd = contexts.reduce((sum, market) => {
    const price = Number(market.markPx ?? market.oraclePx ?? 0);
    return sum + Number(market.openInterest ?? 0) * price;
  }, 0);

  const dailyVolumeUsd = contexts.reduce(
    (sum, market) => sum + Number(market.dayNtlVlm ?? 0),
    0
  );

  let totalUsers: number | null = null;
  let totalDeposits: number | null = null;
  let totalWithdrawals: number | null = null;
  let totalNotionalLiquidated: number | null = null;
  let totalUsdVolume: number | null = null;
  let dailyTrades: number | null = null;

  if (statsApi) {
    sources.push(`hyperliquid-stats-web backend (${statsApi})`);
    const [users, volume, deposits, withdrawals, liquidated, trades] = await Promise.all([
      fetchThunderheadMetric(statsApi, "total_users"),
      fetchThunderheadMetric(statsApi, "total_usd_volume"),
      fetchThunderheadMetric(statsApi, "total_deposits"),
      fetchThunderheadMetric(statsApi, "total_withdrawals"),
      fetchThunderheadMetric(statsApi, "total_notional_liquidated"),
      fetchThunderheadMetric(statsApi, "daily_trades"),
    ]);

    totalUsers = users;
    totalUsdVolume = volume;
    totalDeposits = deposits;
    totalWithdrawals = withdrawals;
    totalNotionalLiquidated = liquidated;
    dailyTrades = trades;
  }

  return {
    markets: contexts.length,
    openInterestUsd,
    dailyVolumeUsd,
    dailyTrades,
    totalUsers,
    totalDeposits,
    totalWithdrawals,
    totalNotionalLiquidated,
    totalUsdVolume,
    sources,
  };
}