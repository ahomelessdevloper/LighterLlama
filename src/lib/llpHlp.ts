const LIGHTER_API = "/lighter-api";
const HYPERLIQUID_API = "/hyperliquid-api";

export const LLP_ACCOUNT_INDEX = 281474976710654;
export const HLP_VAULT_ADDRESS = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";
export const POOL_COMPARE_DAYS = 365;
export const POOL_APY_WINDOW_DAYS = 30;

export interface PublicPoolAsset {
  symbol: string;
  asset_id: number;
  balance: string;
  locked_balance: string;
  margin_mode: string;
  margin_balance: string;
}

export interface PublicPoolMetadata {
  code: number;
  account_index: number;
  created_at: number;
  master_account_index: number;
  account_type: number;
  name: string;
  l1_address: string;
  annual_percentage_yield: number;
  sharpe_ratio: number;
  status: number;
  operator_fee: string;
  total_asset_value: string;
  total_spot_value: string;
  total_perps_value: string;
  total_shares: number;
  assets?: PublicPoolAsset[];
}

export interface LlpSnapshot {
  name: string;
  accountIndex: number;
  apy: number;
  sharpe: number;
  tvl: number;
  perpsValue: number;
  spotValue: number;
  totalShares: number;
  pricePerShare: number;
  operatorFee: number;
  assets: PublicPoolAsset[];
  createdAt: number;
}

type HlpPortfolioPeriod = {
  accountValueHistory: [number, string][];
  pnlHistory: [number, string][];
  vlm: string;
};

type HlpPortfolioEntry = [string, HlpPortfolioPeriod];

export interface PoolHistoryPoint {
  timestamp: number;
  tvl: number;
}

export interface PoolSharePricePoint {
  timestamp: number;
  price: number;
  shareChange: number;
}

export type HlpTvlPoint = PoolHistoryPoint;

export interface PoolComparePoint {
  timestamp: number;
  time: string;
  llp: number | null;
  hlp: number | null;
  llpApy: number | null;
  hlpApy: number | null;
}

export interface PnlEntry {
  timestamp: number;
  trade_pnl: number;
  inflow: number;
  outflow: number;
  pool_total_shares: number;
}

export interface HlpSnapshot {
  name: string;
  vaultAddress: string;
  apr: number;
  apy: number;
  tvl: number;
  leaderCommission: number;
  followerCount: number;
  maxDistributable: number;
  allowDeposits: boolean;
  tvlHistory: HlpTvlPoint[];
  pnlHistory: PoolHistoryPoint[];
  monthPnl: number;
}

export function parsePoolNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function llpMetadataIndex(accountIndex: number): number {
  return accountIndex + 1;
}

export function calcPricePerShare(totalAssetValue: number, totalShares: number): number {
  if (totalShares <= 0) return 0;
  return totalAssetValue / totalShares;
}

export function formatApy(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

export function formatSharpe(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function formatSharePrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function getPortfolioPeriod(
  portfolio: HlpPortfolioEntry[] | undefined,
  period: string
): HlpPortfolioPeriod | null {
  if (!portfolio?.length) return null;
  const entry = portfolio.find(([key]) => key === period);
  return entry?.[1] ?? null;
}

function latestHistoryValue(history: [number, string][] | undefined): number {
  if (!history?.length) return 0;
  return parsePoolNumber(history[history.length - 1][1]);
}

function historyToTvlPoints(history: [number, string][] | undefined): PoolHistoryPoint[] {
  if (!history?.length) return [];
  return history.map(([timestamp, value]) => ({
    timestamp: normalizeTimestamp(timestamp),
    tvl: parsePoolNumber(value),
  }));
}

function normalizeTimestamp(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

function formatHistoryDate(timestamp: number, yearly = false): string {
  return new Date(normalizeTimestamp(timestamp)).toLocaleDateString("en-US", {
    month: "short",
    ...(yearly ? { year: "2-digit" } : { day: "numeric" }),
  });
}

function filterHistoryToDays(points: PoolHistoryPoint[], days: number): PoolHistoryPoint[] {
  if (!points.length) return [];
  const cutoff = Date.now() - days * 86_400_000;
  return points.filter((point) => point.timestamp >= cutoff);
}

function tvlFromPnlEntry(entry: PnlEntry): number {
  return entry.inflow - entry.outflow + entry.trade_pnl;
}

function sharePriceFromPnlEntry(entry: PnlEntry): number | null {
  const shares = parsePoolNumber(entry.pool_total_shares);
  if (shares <= 0) return null;
  const tvl = tvlFromPnlEntry(entry);
  return tvl > 0 ? tvl / shares : null;
}

function findWindowStartIndex(series: PoolHistoryPoint[], index: number, windowDays: number): number {
  if (index <= 0) return -1;
  const target = series[index].timestamp - windowDays * 86_400_000;
  let startIndex = -1;
  for (let i = index - 1; i >= 0; i--) {
    if (series[i].timestamp <= target) {
      startIndex = i;
      break;
    }
  }
  return startIndex;
}

const MAX_SHARE_CHANGE_FOR_APY = 0.05;

function trailingApyFromSharePrices(
  series: PoolSharePricePoint[],
  index: number,
  windowDays = POOL_APY_WINDOW_DAYS
): number | null {
  if (index <= 0 || series[index].shareChange > MAX_SHARE_CHANGE_FOR_APY) return null;

  const target = series[index].timestamp - windowDays * 86_400_000;
  let startIndex = -1;
  for (let i = index - 1; i >= 0; i--) {
    if (series[i].timestamp <= target && series[i].shareChange <= MAX_SHARE_CHANGE_FOR_APY) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return null;

  const start = series[startIndex].price;
  const end = series[index].price;
  const days = (series[index].timestamp - series[startIndex].timestamp) / 86_400_000;
  if (days < 7 || start <= 0 || end <= 0) return null;

  return (end / start - 1) * (365 / days) * 100;
}

function valueAtTimestamp(series: PoolHistoryPoint[], timestamp: number): number | null {
  const index = nearestIndex(series, timestamp);
  return index >= 0 ? series[index].tvl : null;
}

function trailingApyFromPnl(
  pnlHistory: PoolHistoryPoint[],
  accountValueHistory: PoolHistoryPoint[],
  index: number,
  windowDays = POOL_APY_WINDOW_DAYS
): number | null {
  const startIndex = findWindowStartIndex(pnlHistory, index, windowDays);
  if (startIndex < 0) return null;

  const pnlStart = pnlHistory[startIndex].tvl;
  const pnlEnd = pnlHistory[index].tvl;
  const avStart = valueAtTimestamp(accountValueHistory, pnlHistory[startIndex].timestamp);
  const avEnd = valueAtTimestamp(accountValueHistory, pnlHistory[index].timestamp);
  const days = (pnlHistory[index].timestamp - pnlHistory[startIndex].timestamp) / 86_400_000;
  if (days < 7 || avStart == null || avEnd == null || avStart <= 0 || avEnd <= 0) return null;

  const earnings = pnlEnd - pnlStart;
  const avgAccountValue = (avStart + avEnd) / 2;
  return (earnings / avgAccountValue) * (365 / days) * 100;
}

function buildLlpSharePriceSeries(pnl: PnlEntry[]): PoolSharePricePoint[] {
  const sorted = [...pnl].sort(
    (a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp)
  );

  return sorted
    .map((entry, index) => {
      const price = sharePriceFromPnlEntry(entry);
      if (price == null) return null;

      const prevShares =
        index > 0 ? parsePoolNumber(sorted[index - 1].pool_total_shares) : parsePoolNumber(entry.pool_total_shares);
      const shares = parsePoolNumber(entry.pool_total_shares);
      const shareChange =
        index > 0 && prevShares > 0 ? Math.abs((shares - prevShares) / prevShares) : 0;

      return {
        timestamp: normalizeTimestamp(entry.timestamp),
        price,
        shareChange,
      };
    })
    .filter((point): point is PoolSharePricePoint => point != null);
}

function nearestIndex(series: PoolHistoryPoint[], timestamp: number): number {
  if (!series.length) return -1;
  let bestIndex = 0;
  let bestDelta = Infinity;
  series.forEach((point, index) => {
    const delta = Math.abs(point.timestamp - timestamp);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });
  const maxDelta = series.some((_, i, arr) => i > 0 && arr[i].timestamp - arr[i - 1].timestamp > 86_400_000 * 3)
    ? 86_400_000 * 10
    : 86_400_000 * 2;
  return bestDelta <= maxDelta ? bestIndex : -1;
}

function mergePoolTimestamps(...series: PoolHistoryPoint[][]): number[] {
  const timestamps = new Set<number>();
  series.forEach((points) => points.forEach((point) => timestamps.add(point.timestamp)));
  return [...timestamps].sort((a, b) => a - b);
}

function sharePriceIndexAt(series: PoolSharePricePoint[], timestamp: number): number {
  if (!series.length) return -1;

  let bestIndex = 0;
  let bestDelta = Infinity;
  series.forEach((point, index) => {
    const delta = Math.abs(point.timestamp - timestamp);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });

  return bestDelta <= 86_400_000 * 2 ? bestIndex : -1;
}

export function buildPoolCompareSeries(
  llpHistory: PoolHistoryPoint[],
  llpSharePrices: PoolSharePricePoint[],
  hlpHistory: PoolHistoryPoint[],
  hlpPnlHistory: PoolHistoryPoint[],
  yearly = false
): PoolComparePoint[] {
  const timestamps = mergePoolTimestamps(llpHistory, hlpHistory);

  return timestamps.map((timestamp) => {
    const llpIndex = llpHistory.length ? nearestIndex(llpHistory, timestamp) : -1;
    const hlpIndex = hlpHistory.length ? nearestIndex(hlpHistory, timestamp) : -1;
    const llpShareIndex = sharePriceIndexAt(llpSharePrices, timestamp);
    const hlpPnlIndex = hlpPnlHistory.length ? nearestIndex(hlpPnlHistory, timestamp) : -1;

    return {
      timestamp,
      time: formatHistoryDate(timestamp, yearly),
      llp: llpIndex >= 0 ? llpHistory[llpIndex].tvl : null,
      hlp: hlpIndex >= 0 ? hlpHistory[hlpIndex].tvl : null,
      llpApy:
        llpShareIndex >= 0
          ? trailingApyFromSharePrices(llpSharePrices, llpShareIndex)
          : null,
      hlpApy:
        hlpPnlIndex >= 0
          ? trailingApyFromPnl(hlpPnlHistory, hlpHistory, hlpPnlIndex)
          : null,
    };
  });
}

export function latestTrailingApy(
  sharePrices: PoolSharePricePoint[],
  pnlHistory: PoolHistoryPoint[],
  accountValueHistory: PoolHistoryPoint[]
): number | null {
  if (sharePrices.length) {
    return trailingApyFromSharePrices(sharePrices, sharePrices.length - 1);
  }
  if (pnlHistory.length) {
    return trailingApyFromPnl(pnlHistory, accountValueHistory, pnlHistory.length - 1);
  }
  return null;
}

export async function fetchLlpPnlHistory(days = POOL_COMPARE_DAYS): Promise<PnlEntry[]> {
  const end = Date.now();
  const start = end - days * 86_400_000;
  const params = new URLSearchParams({
    by: "index",
    value: String(LLP_ACCOUNT_INDEX),
    resolution: "1d",
    start_timestamp: String(start),
    end_timestamp: String(end),
    count_back: String(days),
  });

  const res = await fetch(`${LIGHTER_API}/pnl?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLP pnl error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as { pnl?: PnlEntry[] };
  return (data.pnl ?? []).sort((a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));
}

export function pnlToTvlHistory(pnl: PnlEntry[]): PoolHistoryPoint[] {
  return pnl
    .map((entry) => ({
      timestamp: normalizeTimestamp(entry.timestamp),
      tvl: tvlFromPnlEntry(entry),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchLlpMetadata(): Promise<LlpSnapshot> {
  const index = llpMetadataIndex(LLP_ACCOUNT_INDEX);
  const res = await fetch(
    `${LIGHTER_API}/publicPoolsMetadata?index=${index}&limit=1`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLP metadata error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as { code?: number; public_pools?: PublicPoolMetadata[] };
  const pool = data.public_pools?.[0];
  if (!pool) throw new Error("LLP metadata not found");

  const tvl = parsePoolNumber(pool.total_asset_value);
  const totalShares = parsePoolNumber(pool.total_shares);

  return {
    name: pool.name,
    accountIndex: pool.account_index,
    apy: pool.annual_percentage_yield,
    sharpe: pool.sharpe_ratio,
    tvl,
    perpsValue: parsePoolNumber(pool.total_perps_value),
    spotValue: parsePoolNumber(pool.total_spot_value),
    totalShares,
    pricePerShare: calcPricePerShare(tvl, totalShares),
    operatorFee: parsePoolNumber(pool.operator_fee),
    assets: pool.assets ?? [],
    createdAt: pool.created_at,
  };
}

interface HlpVaultDetailsRaw {
  name: string;
  vaultAddress: string;
  apr: number;
  leaderCommission: number;
  followers?: unknown[];
  maxDistributable: number;
  allowDeposits: boolean;
  portfolio?: HlpPortfolioEntry[];
}

export async function fetchHlpVaultDetails(): Promise<HlpSnapshot> {
  const res = await fetch(`${HYPERLIQUID_API}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      type: "vaultDetails",
      vaultAddress: HLP_VAULT_ADDRESS,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HLP vault error ${res.status}: ${text || res.statusText}`);
  }

  const raw = (await res.json()) as HlpVaultDetailsRaw | null;
  if (!raw?.name) throw new Error("HLP vault details not found");

  const day = getPortfolioPeriod(raw.portfolio, "day");
  const month = getPortfolioPeriod(raw.portfolio, "month");
  const allTime = getPortfolioPeriod(raw.portfolio, "allTime");
  const tvl = latestHistoryValue(day?.accountValueHistory);
  const monthHistory = month?.accountValueHistory ?? [];
  const monthStart = parsePoolNumber(monthHistory[0]?.[1]);
  const monthEnd = latestHistoryValue(monthHistory);
  const monthPnl = monthEnd - monthStart;
  const tvlHistory = filterHistoryToDays(
    historyToTvlPoints(allTime?.accountValueHistory),
    POOL_COMPARE_DAYS
  );
  const pnlHistory = filterHistoryToDays(
    historyToTvlPoints(allTime?.pnlHistory),
    POOL_COMPARE_DAYS
  );

  return {
    name: raw.name,
    vaultAddress: raw.vaultAddress,
    apr: raw.apr,
    apy: raw.apr * 100,
    tvl,
    leaderCommission: raw.leaderCommission,
    followerCount: raw.followers?.length ?? 0,
    maxDistributable: raw.maxDistributable,
    allowDeposits: raw.allowDeposits,
    tvlHistory,
    pnlHistory,
    monthPnl,
  };
}

export async function fetchLlpHlpSnapshots(): Promise<{
  llp: LlpSnapshot;
  hlp: HlpSnapshot;
  compareSeries: PoolComparePoint[];
  llpTrailingApy: number | null;
  hlpTrailingApy: number | null;
}> {
  const [llp, hlp, llpPnl] = await Promise.all([
    fetchLlpMetadata(),
    fetchHlpVaultDetails(),
    fetchLlpPnlHistory(POOL_COMPARE_DAYS),
  ]);
  const llpHistory = pnlToTvlHistory(llpPnl);
  const llpSharePrices = buildLlpSharePriceSeries(llpPnl);
  const compareSeries = buildPoolCompareSeries(
    llpHistory,
    llpSharePrices,
    hlp.tvlHistory,
    hlp.pnlHistory,
    true
  );
  return {
    llp,
    hlp,
    compareSeries,
    llpTrailingApy: latestTrailingApy(llpSharePrices, [], []),
    hlpTrailingApy: latestTrailingApy([], hlp.pnlHistory, hlp.tvlHistory),
  };
}