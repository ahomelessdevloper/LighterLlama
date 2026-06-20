export interface ValuationSnapshot {
  marketCap: number;
  fdv: number;
  price: number;
  annualFees: number;
  annualRevenue: number;
  pfMarketCap: number;
  pfFdv: number;
  peMarketCap: number;
  peFdv: number;
}

const COINGECKO_IDS = {
  lighter: "lighter",
  hyperliquid: "hyperliquid",
} as const;

type ValuationProject = keyof typeof COINGECKO_IDS;

interface CoinGeckoMarketData {
  market_data: {
    market_cap: { usd: number };
    fully_diluted_valuation: { usd: number };
    current_price: { usd: number };
  };
}

function annualizeFrom30d(total30d: number): number {
  return total30d * 12;
}

function safeRatio(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return numerator / denominator;
}

export async function fetchValuationSnapshot(
  project: ValuationProject,
  fees30d: number,
  revenue30d: number | null
): Promise<ValuationSnapshot> {
  const coinId = COINGECKO_IDS[project];
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`CoinGecko fetch failed for ${project} (${response.status})`);
  }

  const coin = (await response.json()) as CoinGeckoMarketData;
  const marketCap = coin.market_data.market_cap.usd;
  const fdv = coin.market_data.fully_diluted_valuation.usd;
  const price = coin.market_data.current_price.usd;

  const annualFees = annualizeFrom30d(fees30d);
  const annualRevenue = annualizeFrom30d(revenue30d ?? fees30d);

  return {
    marketCap,
    fdv,
    price,
    annualFees,
    annualRevenue,
    pfMarketCap: safeRatio(marketCap, annualFees),
    pfFdv: safeRatio(fdv, annualFees),
    peMarketCap: safeRatio(marketCap, annualRevenue),
    peFdv: safeRatio(fdv, annualRevenue),
  };
}