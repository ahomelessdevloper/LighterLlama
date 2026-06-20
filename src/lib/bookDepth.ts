export interface BookLevel {
  px: number;
  sz: number;
  usd: number;
  n?: number;
}

export interface BookDepthSnapshot {
  coin: string;
  time: number;
  bids: BookLevel[];
  asks: BookLevel[];
  bidDepthUsd: number;
  askDepthUsd: number;
  totalDepthUsd: number;
  spread: number | null;
  spreadBps: number | null;
  mid: number | null;
}

export interface CompareMarket {
  symbol: string;
  category: "crypto" | "rwa" | "forex";
  lighterMarketId: number;
  hyperliquidCoin: string;
}

export const DEPTH_RANGES = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10] as const;
export type DepthRange = (typeof DEPTH_RANGES)[number];
export type DepthXAxisMode = "bps" | "price";

const LIGHTER_API = "/lighter-api";
const HYPERLIQUID_API = "/hyperliquid-api/info";

export const BOOK_DEPTH_TOP_CRYPTO_COUNT = 30;

const RWA_SYMBOLS = new Set(["XAU", "XAG", "PAXG", "TSLA", "NVDA", "AAPL", "GOOGL", "AMZN", "META", "MSFT"]);
const FOREX_SYMBOLS = new Set([
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  "USDKRW",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
]);

/** Meme / low-cap tokens excluded from book-depth crypto picker */
const MEMECOIN_SYMBOLS = new Set([
  "1000PEPE",
  "1000BONK",
  "1000FLOKI",
  "1000SHIB",
  "1000NOT",
  "WIF",
  "TRUMP",
  "FARTCOIN",
  "POPCAT",
  "PUMP",
  "SPX",
  "USELESS",
  "PENGU",
  "VIRTUAL",
  "DOGE",
  "MYX",
  "WLFI",
  "MEGA",
  "BE",
  "ARC",
  "GME",
  "CC",
  "MON",
  "ZORA",
  "PROVE",
  "RESOLV",
  "SYRUP",
  "0G",
  "2Z",
  "RIVER",
  "BOT",
  "FF",
]);

interface LighterOrder {
  price: string;
  remaining_base_amount: string;
}

interface HyperliquidLevel {
  px: string;
  sz: string;
  n: number;
}

function aggregateOrders(orders: LighterOrder[], side: "bid" | "ask"): BookLevel[] {
  const byPrice = new Map<number, number>();
  for (const order of orders) {
    const px = Number(order.price);
    const sz = Number(order.remaining_base_amount);
    if (!Number.isFinite(px) || !Number.isFinite(sz) || sz <= 0) continue;
    byPrice.set(px, (byPrice.get(px) ?? 0) + sz);
  }
  const levels = [...byPrice.entries()].map(([px, sz]) => ({ px, sz, usd: px * sz }));
  levels.sort((a, b) => (side === "bid" ? b.px - a.px : a.px - b.px));
  return levels;
}

function toLevels(levels: HyperliquidLevel[], side: "bid" | "ask"): BookLevel[] {
  const parsed: BookLevel[] = [];
  for (const level of levels) {
    const px = Number(level.px);
    const sz = Number(level.sz);
    if (!Number.isFinite(px) || !Number.isFinite(sz) || sz <= 0) continue;
    parsed.push({ px, sz, usd: px * sz, n: level.n });
  }
  parsed.sort((a, b) => (side === "bid" ? b.px - a.px : a.px - b.px));
  return parsed;
}

function sumDepth(levels: BookLevel[]): number {
  return levels.reduce((sum, level) => sum + level.usd, 0);
}

function buildSnapshot(
  coin: string,
  time: number,
  bids: BookLevel[],
  asks: BookLevel[]
): BookDepthSnapshot {
  const bestBid = bids[0]?.px ?? null;
  const bestAsk = asks[0]?.px ?? null;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk;
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const spreadBps = spread != null && mid != null && mid > 0 ? (spread / mid) * 10_000 : null;
  return {
    coin,
    time,
    bids,
    asks,
    bidDepthUsd: sumDepth(bids),
    askDepthUsd: sumDepth(asks),
    totalDepthUsd: sumDepth(bids) + sumDepth(asks),
    spread,
    spreadBps,
    mid,
  };
}

function categorizeSymbol(symbol: string): CompareMarket["category"] {
  if (RWA_SYMBOLS.has(symbol)) return "rwa";
  if (FOREX_SYMBOLS.has(symbol)) return "forex";
  return "crypto";
}

function isMemecoin(symbol: string): boolean {
  return MEMECOIN_SYMBOLS.has(symbol);
}

async function fetchHyperliquidCoins(): Promise<Set<string>> {
  const response = await fetch(HYPERLIQUID_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!response.ok) throw new Error(`Hyperliquid meta failed (${response.status})`);
  const data = (await response.json()) as [{ universe?: Array<{ name: string }> }, unknown];
  return new Set((data[0]?.universe ?? []).map((asset) => asset.name));
}

export async function fetchCompareMarkets(): Promise<CompareMarket[]> {
  const [response, hyperliquidCoins] = await Promise.all([
    fetch(`${LIGHTER_API}/orderBookDetails`),
    fetchHyperliquidCoins(),
  ]);
  if (!response.ok) throw new Error(`Lighter markets failed (${response.status})`);
  const data = (await response.json()) as {
    order_book_details?: Array<{
      symbol: string;
      market_id: number;
      market_type: string;
      status: string;
      daily_quote_token_volume?: string;
    }>;
  };

  const active = (data.order_book_details ?? []).filter(
    (m) =>
      m.market_type === "perp" &&
      m.status === "active" &&
      hyperliquidCoins.has(m.symbol)
  );

  const markets = active.map((m) => ({
    symbol: m.symbol,
    category: categorizeSymbol(m.symbol),
    lighterMarketId: m.market_id,
    hyperliquidCoin: m.symbol,
    volume: Number(m.daily_quote_token_volume) || 0,
  }));

  const topCrypto = markets
    .filter((m) => m.category === "crypto" && !isMemecoin(m.symbol))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, BOOK_DEPTH_TOP_CRYPTO_COUNT);

  const rwaForex = markets.filter((m) => m.category !== "crypto");

  return [...topCrypto, ...rwaForex]
    .map(({ volume: _volume, ...market }) => market)
    .sort((a, b) => {
      const catOrder = { crypto: 0, rwa: 1, forex: 2 } as const;
      const byCat = catOrder[a.category] - catOrder[b.category];
      return byCat !== 0 ? byCat : a.symbol.localeCompare(b.symbol);
    });
}

export async function fetchLighterBookDepth(
  market: CompareMarket,
  limit = 100
): Promise<BookDepthSnapshot> {
  const response = await fetch(
    `${LIGHTER_API}/orderBookOrders?market_id=${market.lighterMarketId}&limit=${limit}`
  );
  if (!response.ok) throw new Error(`Lighter order book failed (${response.status})`);
  const data = (await response.json()) as { asks?: LighterOrder[]; bids?: LighterOrder[] };
  const asks = aggregateOrders(data.asks ?? [], "ask").slice(0, limit);
  const bids = aggregateOrders(data.bids ?? [], "bid").slice(0, limit);
  return buildSnapshot(market.symbol, Date.now(), bids, asks);
}

export async function fetchHyperliquidBookDepth(market: CompareMarket): Promise<BookDepthSnapshot> {
  const response = await fetch(HYPERLIQUID_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "l2Book", coin: market.hyperliquidCoin }),
  });
  if (!response.ok) throw new Error(`Hyperliquid l2Book failed (${response.status})`);
  const data = (await response.json()) as {
    coin: string;
    time: number;
    levels: [HyperliquidLevel[], HyperliquidLevel[]];
  };
  const [rawBids, rawAsks] = data.levels ?? [[], []];
  return buildSnapshot(data.coin, data.time, toLevels(rawBids, "bid"), toLevels(rawAsks, "ask"));
}

export interface DepthChartPoint {
  x: number;
  label: string;
  hlBid: number | null;
  hlAsk: number | null;
  lighterBid: number | null;
  lighterAsk: number | null;
}

function pctFromMid(mid: number, px: number, side: "bid" | "ask"): number {
  if (side === "bid") return Math.max(0, ((mid - px) / mid) * 100);
  return Math.max(0, ((px - mid) / mid) * 100);
}

function sideProfile(
  levels: BookLevel[],
  mid: number,
  side: "bid" | "ask",
  rangePct: number,
  mode: DepthXAxisMode
): Array<{ x: number; y: number }> {
  if (!mid || !levels.length) return [{ x: 0, y: 0 }];
  const points: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let cum = 0;
  for (const level of levels) {
    const pct = pctFromMid(mid, level.px, side);
    if (pct > rangePct) break;
    cum += level.usd;
    const rawX = mode === "bps" ? pct * 100 : level.px;
    const x = side === "bid" ? -rawX : rawX;
    points.push({ x, y: cum });
  }
  return points;
}

export function buildDepthChartData(
  lighter: BookDepthSnapshot,
  hyperliquid: BookDepthSnapshot,
  rangePct: number,
  mode: DepthXAxisMode
): DepthChartPoint[] {
  const lMid = lighter.mid ?? 0;
  const hMid = hyperliquid.mid ?? 0;
  const lBid = sideProfile(lighter.bids, lMid, "bid", rangePct, mode);
  const lAsk = sideProfile(lighter.asks, lMid, "ask", rangePct, mode);
  const hBid = sideProfile(hyperliquid.bids, hMid, "bid", rangePct, mode);
  const hAsk = sideProfile(hyperliquid.asks, hMid, "ask", rangePct, mode);

  const xSet = new Set<number>([0]);
  for (const p of [...lBid, ...lAsk, ...hBid, ...hAsk]) xSet.add(p.x);

  const xs = [...xSet].sort((a, b) => a - b);
  const lb = new Map(lBid.map((p) => [p.x, p.y]));
  const la = new Map(lAsk.map((p) => [p.x, p.y]));
  const hb = new Map(hBid.map((p) => [p.x, p.y]));
  const ha = new Map(hAsk.map((p) => [p.x, p.y]));

  let lcB = 0;
  let lcA = 0;
  let hcB = 0;
  let hcA = 0;

  return xs.map((x) => {
    if (lb.has(x)) lcB = lb.get(x)!;
    if (la.has(x)) lcA = la.get(x)!;
    if (hb.has(x)) hcB = hb.get(x)!;
    if (ha.has(x)) hcA = ha.get(x)!;
    const label =
      mode === "bps"
        ? x === 0
          ? "0"
          : `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(x < 1 && x > -1 ? 1 : 0)} bps`
        : x.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return {
      x,
      label,
      lighterBid: x <= 0 ? lcB : null,
      lighterAsk: x >= 0 ? lcA : null,
      hlBid: x <= 0 ? hcB : null,
      hlAsk: x >= 0 ? hcA : null,
    };
  });
}

export interface VenueDepthPoint {
  x: number;
  label: string;
  bid: number | null;
  ask: number | null;
}

export interface DepthRangeStats {
  bidUsd: number;
  askUsd: number;
  totalUsd: number;
}

export function getDepthWithinRange(
  snapshot: BookDepthSnapshot,
  rangePct: number
): DepthRangeStats {
  const mid = snapshot.mid ?? 0;
  if (!mid) return { bidUsd: 0, askUsd: 0, totalUsd: 0 };

  let bidUsd = 0;
  let askUsd = 0;

  for (const level of snapshot.bids) {
    if (pctFromMid(mid, level.px, "bid") <= rangePct) bidUsd += level.usd;
    else break;
  }
  for (const level of snapshot.asks) {
    if (pctFromMid(mid, level.px, "ask") <= rangePct) askUsd += level.usd;
    else break;
  }

  return { bidUsd, askUsd, totalUsd: bidUsd + askUsd };
}

export function buildVenueDepthProfile(
  snapshot: BookDepthSnapshot,
  rangePct: number,
  mode: DepthXAxisMode
): VenueDepthPoint[] {
  const mid = snapshot.mid ?? 0;
  const bids = sideProfile(snapshot.bids, mid, "bid", rangePct, mode);
  const asks = sideProfile(snapshot.asks, mid, "ask", rangePct, mode);

  const xSet = new Set<number>([0]);
  for (const p of [...bids, ...asks]) xSet.add(p.x);

  const bidMap = new Map(bids.map((p) => [p.x, p.y]));
  const askMap = new Map(asks.map((p) => [p.x, p.y]));

  let cumBid = 0;
  let cumAsk = 0;

  return [...xSet].sort((a, b) => a - b).map((x) => {
    if (bidMap.has(x)) cumBid = bidMap.get(x)!;
    if (askMap.has(x)) cumAsk = askMap.get(x)!;
    const label =
      mode === "bps"
        ? x === 0
          ? "Mid"
          : `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(Math.abs(x) < 10 ? 1 : 0)} bps`
        : x === 0
          ? "Mid"
          : x.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return {
      x,
      label,
      bid: x <= 0 ? cumBid : null,
      ask: x >= 0 ? cumAsk : null,
    };
  });
}

export function formatMidPrice(price: number | null): string {
  if (price == null) return "—";
  if (price >= 10_000) return price.toFixed(1);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(5);
}