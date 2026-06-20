import { parsePoolNumber, type PublicPoolAsset, type PublicPoolMetadata } from "./llpHlp";

const LIGHTER_API = "/lighter-api";

export const LIT_STAKING_MASTER_INDEX = 0;
export const LIT_CIRCULATING_FALLBACK = 250_000_000;

const COINGECKO_API = "/coingecko-api";

export interface ExchangeMetricPoint {
  timestamp: number;
  data: number;
}

export interface LitSupplySegment {
  id: "staked" | "buyback" | "in_trading";
  label: string;
  value: number;
  pct: number;
  color: string;
}

export interface LitSupplyBreakdown {
  circulatingSupply: number;
  totalBuybackLit: number;
  stakedLit: number;
  outOfTrading: number;
  inTrading: number;
  outOfTradingPct: number;
  inTradingPct: number;
  segments: LitSupplySegment[];
}

export interface SystemConfig {
  code?: number;
  liquidity_pool_index: number;
  staking_pool_index: number;
  staking_pool_lockup_period: number;
  liquidity_pool_cooldown_period?: number;
}

export interface LitStakingSnapshot {
  accountIndex: number;
  masterAccountIndex: number;
  name: string;
  stakedLit: number;
  usdValue: number;
  totalShares: number;
  litPerShare: number;
  operatorFee: number;
  apy: number;
  lockupMs: number;
  lockupDays: number;
  createdAt: number;
  assets: PublicPoolAsset[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${LIGHTER_API}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  return fetchJson<SystemConfig>("/systemConfig");
}

function poolMetadataIndex(accountIndex: number): number {
  return accountIndex + 1;
}

function litBalance(assets: PublicPoolAsset[] | undefined): number {
  const lit = assets?.find((a) => a.symbol === "LIT");
  return lit ? parsePoolNumber(lit.balance) : 0;
}

export function formatLitAmount(value: number, compact = true): string {
  if (!Number.isFinite(value)) return "—";
  if (compact) {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(2);
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatLockup(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const days = ms / 86_400_000;
  if (days >= 1) return `${days.toFixed(days % 1 === 0 ? 0 : 1)} days`;
  const hours = ms / 3_600_000;
  return `${hours.toFixed(0)} hours`;
}

export async function fetchTotalBuybackLit(): Promise<number> {
  const data = await fetchJson<{ metrics?: ExchangeMetricPoint[] }>(
    "/exchangeMetrics?period=all&kind=buyback"
  );
  return (data.metrics ?? []).reduce((sum, point) => sum + parsePoolNumber(point.data), 0);
}

export async function fetchLitCirculatingSupply(): Promise<number> {
  try {
    const res = await fetch(
      `${COINGECKO_API}/coins/lighter?localization=false&tickers=false&community_data=false&developer_data=false`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const json = (await res.json()) as { market_data?: { circulating_supply?: number } };
    const supply = json.market_data?.circulating_supply;
    if (typeof supply === "number" && supply > 0) return supply;
  } catch {
    // fallback below
  }
  return LIT_CIRCULATING_FALLBACK;
}

export function buildLitSupplyBreakdown(
  circulatingSupply: number,
  totalBuybackLit: number,
  stakedLit: number
): LitSupplyBreakdown {
  const outOfTrading = totalBuybackLit + stakedLit;
  const inTrading = Math.max(0, circulatingSupply - outOfTrading);
  const pct = (value: number) =>
    circulatingSupply > 0 ? (value / circulatingSupply) * 100 : 0;

  const segments: LitSupplySegment[] = [
    {
      id: "staked",
      label: "Staked",
      value: stakedLit,
      pct: pct(stakedLit),
      color: "#22d3ee",
    },
    {
      id: "buyback",
      label: "Buyback",
      value: totalBuybackLit,
      pct: pct(totalBuybackLit),
      color: "#fbbf24",
    },
    {
      id: "in_trading",
      label: "In trading",
      value: inTrading,
      pct: pct(inTrading),
      color: "#4ade80",
    },
  ];

  return {
    circulatingSupply,
    totalBuybackLit,
    stakedLit,
    outOfTrading,
    inTrading,
    outOfTradingPct: pct(outOfTrading),
    inTradingPct: pct(inTrading),
    segments,
  };
}

export async function fetchLitSupplyBreakdown(stakedLit: number): Promise<LitSupplyBreakdown> {
  const [circulatingSupply, totalBuybackLit] = await Promise.all([
    fetchLitCirculatingSupply(),
    fetchTotalBuybackLit(),
  ]);
  return buildLitSupplyBreakdown(circulatingSupply, totalBuybackLit, stakedLit);
}

export async function fetchLitStakingPool(): Promise<LitStakingSnapshot> {
  const config = await fetchSystemConfig();
  const accountIndex = config.staking_pool_index;
  const index = poolMetadataIndex(accountIndex);

  const data = await fetchJson<{ code?: number; public_pools?: PublicPoolMetadata[] }>(
    `/publicPoolsMetadata?filter=stake&index=${index}&limit=1`
  );

  const pool = data.public_pools?.[0];
  if (!pool) throw new Error("LIT staking pool metadata not found");

  const stakedLit = litBalance(pool.assets);
  const totalShares = parsePoolNumber(pool.total_shares);
  const usdValue = parsePoolNumber(pool.total_spot_value) || parsePoolNumber(pool.total_asset_value);

  return {
    accountIndex: pool.account_index,
    masterAccountIndex: pool.master_account_index,
    name: pool.name || "LIT Staking Pool",
    stakedLit,
    usdValue,
    totalShares,
    litPerShare: totalShares > 0 ? stakedLit / totalShares : 0,
    operatorFee: parsePoolNumber(pool.operator_fee),
    apy: pool.annual_percentage_yield,
    lockupMs: config.staking_pool_lockup_period,
    lockupDays: config.staking_pool_lockup_period / 86_400_000,
    createdAt: pool.created_at,
    assets: pool.assets ?? [],
  };
}