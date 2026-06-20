export interface FeeSummary {
  total24h: number;
  total7d: number;
  total30d: number;
  totalAllTime: number;
  totalDataChart: Array<[number, number]>;
}

export async function fetchFeeSummary(protocol: string): Promise<FeeSummary> {
  const response = await fetch(`https://api.llama.fi/summary/fees/${protocol}`);
  if (!response.ok) {
    throw new Error(`DefiLlama fees fetch failed for ${protocol} (${response.status})`);
  }

  return (await response.json()) as FeeSummary;
}

export async function fetchRevenueSummary(protocol: string): Promise<FeeSummary | null> {
  const response = await fetch(`https://api.llama.fi/summary/revenue/${protocol}`);
  if (!response.ok) return null;
  return (await response.json()) as FeeSummary;
}

export async function fetchLatestTvl(protocol: string): Promise<number> {
  const response = await fetch(`https://api.llama.fi/protocol/${protocol}`);
  if (!response.ok) {
    throw new Error(`DefiLlama protocol fetch failed for ${protocol} (${response.status})`);
  }

  const data = (await response.json()) as {
    tvl?: Array<{ date: number; totalLiquidityUSD: number }>;
    chainTvls?: Record<string, { tvl: Array<{ date: number; totalLiquidityUSD: number }> }>;
  };

  const series = data.tvl ?? [];
  const latest = series.at(-1)?.totalLiquidityUSD;
  if (latest != null) return latest;

  const chainSeries = Object.values(data.chainTvls ?? {})
    .flatMap((chain) => chain.tvl ?? [])
    .sort((a, b) => a.date - b.date);

  return chainSeries.at(-1)?.totalLiquidityUSD ?? 0;
}