const LIGHTER_API = "/lighter-api";

export type ExecuteStatsPeriod = "d" | "w" | "m" | "q" | "y" | "all";

export const EXECUTE_STATS_PERIODS: { value: ExecuteStatsPeriod; label: string }[] = [
  { value: "d", label: "24H" },
  { value: "w", label: "7D" },
  { value: "m", label: "30D" },
  { value: "q", label: "90D" },
  { value: "y", label: "1Y" },
  { value: "all", label: "All" },
];

export const EXECUTE_TRADE_SIZES = [10_000, 100_000, 1_000_000, 10_000_000] as const;
export type ExecuteTradeSize = (typeof EXECUTE_TRADE_SIZES)[number];

export const EXECUTE_VENUES = [
  { id: "lighter", label: "Lighter", short: "L", color: "#22d3ee", defaultFeeBps: 0 },
  { id: "hyperliquid", label: "Hyperliquid", short: "HL", color: "#4ade80", defaultFeeBps: 4.5 },
  { id: "binance", label: "Binance", short: "BN", color: "#f0b90b", defaultFeeBps: 5 },
  { id: "bybit", label: "Bybit", short: "BY", color: "#f7a600", defaultFeeBps: 5.5 },
  { id: "aster", label: "Aster", short: "AS", color: "#a78bfa", defaultFeeBps: 4 },
] as const;

export type ExecuteVenue = (typeof EXECUTE_VENUES)[number]["id"];

export interface SlippageResult {
  exchange: string;
  market: string;
  size_usd: number;
  avg_slippage: number;
  data_count: number;
}

export interface ExecuteStatPoint {
  timestamp: number;
  slippage: SlippageResult[];
}

export interface ExecuteStatsResponse {
  code?: number;
  period: ExecuteStatsPeriod;
  result: ExecuteStatPoint[];
}

export interface VenueCostCell {
  feeBps: number;
  slippageBps: number | null;
  feeUsd: number;
  slippageUsd: number | null;
  allInUsd: number | null;
  allInBps: number | null;
}

const RWA_MARKETS = new Set(["WTI", "XAG", "XAU", "BRENTOIL", "NATGAS", "PAXG", "EURUSD", "GBPUSD"]);

export function getExecuteMarketCategory(symbol: string): "crypto" | "rwa" {
  return RWA_MARKETS.has(symbol) ? "rwa" : "crypto";
}

export function formatTradeSize(size: number): string {
  if (size >= 1_000_000) return `$${size / 1_000_000}M`;
  if (size >= 1_000) return `$${size / 1_000}K`;
  return `$${size}`;
}

export function formatSlippageBps(value: number | null | undefined): string {
  if (value == null || value < 0) return "—";
  return `${value.toFixed(2)} bps`;
}

export function formatFeeUsd(value: number | null | undefined, compact = true): string {
  if (value == null) return "—";
  if (compact) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    if (value >= 100) return `$${value.toFixed(0)}`;
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function isValidSlippage(entry: SlippageResult): boolean {
  return entry.data_count > 0 && entry.avg_slippage >= 0;
}

export function feeUsdFromBps(notional: number, feeBps: number): number {
  return notional * (feeBps / 10_000);
}

export function slippageUsdFromBps(notional: number, slippageBps: number): number {
  return notional * (slippageBps / 10_000);
}

export async function fetchExecuteStats(period: ExecuteStatsPeriod): Promise<ExecuteStatsResponse> {
  const response = await fetch(`${LIGHTER_API}/executeStats?period=${period}`);
  if (!response.ok) {
    throw new Error(`executeStats failed (${response.status})`);
  }
  return response.json() as Promise<ExecuteStatsResponse>;
}

export function getCompareMarkets(points: ExecuteStatPoint[]): string[] {
  const latest = points[points.length - 1];
  if (!latest) return [];

  const byMarket = new Map<string, Set<string>>();
  for (const row of latest.slippage) {
    if (!isValidSlippage(row)) continue;
    const set = byMarket.get(row.market) ?? new Set<string>();
    set.add(row.exchange);
    byMarket.set(row.market, set);
  }

  return [...byMarket.entries()]
    .filter(([, set]) => set.has("lighter") && set.has("hyperliquid"))
    .map(([market]) => market)
    .sort((a, b) => a.localeCompare(b));
}

export function findSlippage(
  point: ExecuteStatPoint | undefined,
  venue: ExecuteVenue,
  market: string,
  sizeUsd: ExecuteTradeSize
): SlippageResult | null {
  if (!point) return null;
  const row = point.slippage.find(
    (s) => s.exchange === venue && s.market === market && s.size_usd === sizeUsd
  );
  return row && isValidSlippage(row) ? row : null;
}

export function buildVenueCostCell(
  notional: ExecuteTradeSize,
  feeBps: number,
  slippageBps: number | null
): VenueCostCell {
  const feeUsd = feeUsdFromBps(notional, feeBps);
  const slippageUsd = slippageBps != null ? slippageUsdFromBps(notional, slippageBps) : null;
  const allInUsd = slippageUsd != null ? feeUsd + slippageUsd : null;
  const allInBps = slippageBps != null ? feeBps + slippageBps : null;
  return { feeBps, slippageBps, feeUsd, slippageUsd, allInUsd, allInBps };
}

export function getVenueCostMatrix(
  points: ExecuteStatPoint[],
  market: string,
  feeBpsByVenue: Record<ExecuteVenue, number>
): Record<ExecuteTradeSize, Record<ExecuteVenue, VenueCostCell>> {
  const latest = points[points.length - 1];
  const matrix = {} as Record<ExecuteTradeSize, Record<ExecuteVenue, VenueCostCell>>;

  for (const size of EXECUTE_TRADE_SIZES) {
    matrix[size] = {} as Record<ExecuteVenue, VenueCostCell>;
    for (const venue of EXECUTE_VENUES) {
      const slippage = findSlippage(latest, venue.id, market, size)?.avg_slippage ?? null;
      matrix[size][venue.id] = buildVenueCostCell(size, feeBpsByVenue[venue.id], slippage);
    }
  }

  return matrix;
}

export function cheapestVenue(
  cells: Partial<Record<ExecuteVenue, VenueCostCell>>,
  metric: "feeUsd" | "allInUsd"
): ExecuteVenue | null {
  let best: ExecuteVenue | null = null;
  let bestVal = Infinity;
  for (const venue of EXECUTE_VENUES) {
    const val = cells[venue.id]?.[metric];
    if (val == null) continue;
    if (val < bestVal) {
      bestVal = val;
      best = venue.id;
    }
  }
  return best;
}

export function buildSlippageHistory(
  points: ExecuteStatPoint[],
  venue: ExecuteVenue,
  market: string,
  sizeUsd: ExecuteTradeSize
): Array<{ ts: number; label: string; slippage: number }> {
  return points
    .map((point) => {
      const row = findSlippage(point, venue, market, sizeUsd);
      if (!row) return null;
      const date = new Date(point.timestamp * 1000);
      return {
        ts: point.timestamp,
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        slippage: row.avg_slippage,
      };
    })
    .filter((row): row is { ts: number; label: string; slippage: number } => row != null);
}

export function buildAllInHistory(
  points: ExecuteStatPoint[],
  venue: ExecuteVenue,
  market: string,
  sizeUsd: ExecuteTradeSize,
  feeBps: number
): Array<{ ts: number; label: string; allInBps: number }> {
  return points
    .map((point) => {
      const row = findSlippage(point, venue, market, sizeUsd);
      if (!row) return null;
      const date = new Date(point.timestamp * 1000);
      return {
        ts: point.timestamp,
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        allInBps: feeBps + row.avg_slippage,
      };
    })
    .filter((row): row is { ts: number; label: string; allInBps: number } => row != null);
}