import type { TimeSeriesPoint, ValuationRatioCharts } from "../../src/types/liveStats";
import type { ValuationSnapshot } from "./valuation";

const COINGECKO_IDS = {
  lighter: "lighter",
  hyperliquid: "hyperliquid",
} as const;

type ValuationProject = keyof typeof COINGECKO_IDS;

interface CoinGeckoMarketChart {
  market_caps: Array<[number, number]>;
}

function dayKeyFromSeconds(timestampSeconds: number): number {
  const date = new Date(timestampSeconds * 1000);
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function dayKeyFromMillis(timestampMillis: number): number {
  return dayKeyFromSeconds(Math.floor(timestampMillis / 1000));
}

function buildDailyFeeMap(feeChart: Array<[number, number]>): Map<number, number> {
  const map = new Map<number, number>();
  for (const [timestamp, value] of feeChart) {
    const day = dayKeyFromSeconds(timestamp);
    map.set(day, (map.get(day) ?? 0) + value);
  }
  return map;
}

function buildDailyMarketCapMap(marketCaps: Array<[number, number]>): Map<number, number> {
  const map = new Map<number, number>();
  for (const [timestamp, value] of marketCaps) {
    const day = dayKeyFromMillis(timestamp);
    map.set(day, value);
  }
  return map;
}

function trailing30dAnnualized(feeByDay: Map<number, number>, day: number): number | null {
  let sum = 0;
  let days = 0;
  for (let offset = 0; offset < 30; offset += 1) {
    const key = day - offset * 86_400;
    const value = feeByDay.get(key);
    if (value != null) {
      sum += value;
      days += 1;
    }
  }
  if (days < 7 || sum <= 0) return null;
  return sum * 12;
}

function nearestMarketCap(marketCapByDay: Map<number, number>, day: number): number | null {
  for (let offset = 0; offset <= 3; offset += 1) {
    const value = marketCapByDay.get(day - offset * 86_400);
    if (value != null) return value;
  }
  return null;
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}

async function fetchMarketCapHistory(project: ValuationProject): Promise<Array<[number, number]>> {
  const coinId = COINGECKO_IDS[project];
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=30&interval=daily`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`CoinGecko market chart failed for ${project} (${response.status})`);
  }

  const chart = (await response.json()) as CoinGeckoMarketChart;
  return chart.market_caps;
}

function buildProjectRatioSeries(
  feeChart: Array<[number, number]>,
  earningsChart: Array<[number, number]> | null,
  marketCapHistory: Array<[number, number]>,
  snapshot: ValuationSnapshot
): {
  pf_mcap: Array<{ timestamp: number; value: number | null }>;
  pf_fdv: Array<{ timestamp: number; value: number | null }>;
  pe_mcap: Array<{ timestamp: number; value: number | null }>;
  pe_fdv: Array<{ timestamp: number; value: number | null }>;
} {
  const feeByDay = buildDailyFeeMap(feeChart);
  const earningsByDay = buildDailyFeeMap(earningsChart ?? feeChart);
  const marketCapByDay = buildDailyMarketCapMap(marketCapHistory);
  const fdvRatio = snapshot.marketCap > 0 ? snapshot.fdv / snapshot.marketCap : 1;

  const days = [...feeByDay.keys()].sort((a, b) => a - b).slice(-30);

  const pf_mcap: Array<{ timestamp: number; value: number | null }> = [];
  const pf_fdv: Array<{ timestamp: number; value: number | null }> = [];
  const pe_mcap: Array<{ timestamp: number; value: number | null }> = [];
  const pe_fdv: Array<{ timestamp: number; value: number | null }> = [];

  for (const day of days) {
    const annualFees = trailing30dAnnualized(feeByDay, day);
    const annualEarnings = trailing30dAnnualized(earningsByDay, day);
    const marketCap = nearestMarketCap(marketCapByDay, day);
    const fdv = marketCap == null ? null : marketCap * fdvRatio;

    pf_mcap.push({ timestamp: day, value: safeRatio(marketCap, annualFees) });
    pf_fdv.push({ timestamp: day, value: safeRatio(fdv, annualFees) });
    pe_mcap.push({ timestamp: day, value: safeRatio(marketCap, annualEarnings) });
    pe_fdv.push({ timestamp: day, value: safeRatio(fdv, annualEarnings) });
  }

  return { pf_mcap, pf_fdv, pe_mcap, pe_fdv };
}

function mergeRatioSeries(
  lighter: Array<{ timestamp: number; value: number | null }>,
  hyperliquid: Array<{ timestamp: number; value: number | null }>
): TimeSeriesPoint[] {
  const lighterMap = new Map(lighter.map((point) => [point.timestamp, point.value]));
  const timestamps = new Set<number>([
    ...lighter.map((point) => point.timestamp),
    ...hyperliquid.map((point) => point.timestamp),
  ]);

  return [...timestamps]
    .sort((a, b) => a - b)
    .map((timestamp) => ({
      timestamp,
      lighter: lighterMap.get(timestamp) ?? null,
      hyperliquid: hyperliquid.find((point) => point.timestamp === timestamp)?.value ?? null,
    }));
}

export async function buildValuationRatioCharts(input: {
  lighterFeesChart: Array<[number, number]>;
  hyperliquidFeesChart: Array<[number, number]>;
  lighterRevenueChart: Array<[number, number]> | null;
  hyperliquidRevenueChart: Array<[number, number]> | null;
  lighterSnapshot: ValuationSnapshot;
  hyperliquidSnapshot: ValuationSnapshot;
}): Promise<ValuationRatioCharts> {
  const [lighterMarketCaps, hyperliquidMarketCaps] = await Promise.all([
    fetchMarketCapHistory("lighter"),
    fetchMarketCapHistory("hyperliquid"),
  ]);

  const lighterSnapshot = input.lighterSnapshot;
  const hyperliquidSnapshot = input.hyperliquidSnapshot;

  const lighterSeries = buildProjectRatioSeries(
    input.lighterFeesChart,
    input.lighterRevenueChart,
    lighterMarketCaps,
    lighterSnapshot
  );
  const hyperliquidSeries = buildProjectRatioSeries(
    input.hyperliquidFeesChart,
    input.hyperliquidRevenueChart,
    hyperliquidMarketCaps,
    hyperliquidSnapshot
  );

  return {
    pf_mcap: mergeRatioSeries(lighterSeries.pf_mcap, hyperliquidSeries.pf_mcap),
    pf_fdv: mergeRatioSeries(lighterSeries.pf_fdv, hyperliquidSeries.pf_fdv),
    pe_mcap: mergeRatioSeries(lighterSeries.pe_mcap, hyperliquidSeries.pe_mcap),
    pe_fdv: mergeRatioSeries(lighterSeries.pe_fdv, hyperliquidSeries.pe_fdv),
  };
}