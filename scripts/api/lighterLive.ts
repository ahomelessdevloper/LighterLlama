const LIGHTER_API = "https://mainnet.zklighter.elliot.ai/api/v1";

async function fetchLighterOpenInterestUsd(): Promise<number> {
  const response = await fetch(`${LIGHTER_API}/exchangeMetrics?period=m&kind=open_interest`);
  if (!response.ok) {
    throw new Error(`Lighter open_interest metrics failed (${response.status})`);
  }

  const data = (await response.json()) as {
    metrics?: Array<{ timestamp: number; data: number }>;
  };

  const metrics = data.metrics ?? [];
  if (!metrics.length) return 0;
  return metrics[metrics.length - 1].data;
}

export interface LighterLiveMetrics {
  markets: number;
  openInterestUsd: number;
  dailyVolumeUsd: number;
  dailyTrades: number;
  sources: string[];
}

export async function fetchLighterLiveMetrics(): Promise<LighterLiveMetrics> {
  const [orderBookResponse, openInterestUsd] = await Promise.all([
    fetch(`${LIGHTER_API}/orderBookDetails`),
    fetchLighterOpenInterestUsd(),
  ]);

  if (!orderBookResponse.ok) {
    throw new Error(`Lighter orderBookDetails failed (${orderBookResponse.status})`);
  }

  const data = (await orderBookResponse.json()) as {
    order_book_details: Array<{
      market_type: string;
      daily_quote_token_volume?: number;
      daily_trades_count?: number;
    }>;
  };

  const perps = data.order_book_details.filter((market) => market.market_type === "perp");

  const dailyVolumeUsd = perps.reduce(
    (sum, market) => sum + Number(market.daily_quote_token_volume ?? 0),
    0
  );

  const dailyTrades = perps.reduce(
    (sum, market) => sum + Number(market.daily_trades_count ?? 0),
    0
  );

  return {
    markets: perps.length,
    openInterestUsd,
    dailyVolumeUsd,
    dailyTrades,
    sources: [
      "mainnet.zklighter.elliot.ai/api/v1/orderBookDetails",
      "mainnet.zklighter.elliot.ai/api/v1/exchangeMetrics?kind=open_interest",
    ],
  };
}