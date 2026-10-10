export type VenueId =
  | "lighter"
  | "hyperliquid"
  | "binance"
  | "bybit"
  | "okx"
  | "bitget"
  | "aster";

export interface VenueMeta {
  id: VenueId;
  label: string;
  short: string;
  /** Approximate standard-tier taker fee, in bps. Used for the net-of-fee estimate. */
  takerBps: number;
}

export const VENUES: VenueMeta[] = [
  { id: "lighter", label: "Lighter", short: "Lighter", takerBps: 0 },
  { id: "hyperliquid", label: "Hyperliquid", short: "HL", takerBps: 4.5 },
  { id: "binance", label: "Binance", short: "Binance", takerBps: 5 },
  { id: "bybit", label: "Bybit", short: "Bybit", takerBps: 5.5 },
  { id: "okx", label: "OKX", short: "OKX", takerBps: 5 },
  { id: "bitget", label: "Bitget", short: "Bitget", takerBps: 6 },
  { id: "aster", label: "Aster", short: "Aster", takerBps: 3.5 },
];

export const VENUE_BY_ID = Object.fromEntries(VENUES.map((v) => [v.id, v])) as Record<
  VenueId,
  VenueMeta
>;

const SKIP_BASES = new Set([
  "USDT",
  "USDC",
  "USD",
  "BUSD",
  "FDUSD",
  "DAI",
  "TUSD",
  "USDE",
  "USD1",
  "USDD",
]);

const MULT_RE = /^(1000000|100000|10000|1000)([A-Z0-9]{2,})$/;

/**
 * Two venues quoting the same ticker count as the same asset only when their unit
 * prices agree within this band. Real cross-venue perp marks sit inside ~0.5%, so
 * anything wider is a ticker collision rather than an arbitrage: Binance lists both
 * CATUSDT (Caterpillar stock, ~$805) and 1000CATUSDT (the memecoin), and Lighter
 * lists equity perps such as DIA and BB whose tickers are also crypto tickers.
 */
const MATCH_TOLERANCE = 0.03;

/** Gaps wider than this are treated as bad data, not opportunity. */
const MAX_PLAUSIBLE_BPS = 1500;

export interface ArbQuote {
  venue: VenueId;
  nativeSymbol: string;
  multiplier: number;
  rawPrice: number;
  unitPrice: number;
  /** Signed deviation from the cross-venue consensus price, in bps. */
  devBps: number;
}

export type ArbConfidence = "high" | "medium" | "low";

export interface ArbMarket {
  base: string;
  display: string;
  displayScale: number;
  /** Median unit price across the matched venues. */
  consensus: number;
  quotes: ArbQuote[];
  byVenue: Partial<Record<VenueId, ArbQuote>>;
  low: ArbQuote;
  high: ArbQuote;
  gapAbs: number;
  gapPct: number;
  gapBps: number;
  /** gapBps minus the estimated taker fee on both legs. */
  netBps: number;
  venueCount: number;
  /** Listings dropped because their price did not agree with the consensus. */
  excludedCount: number;
  /** Set when one venue alone creates the gap, which usually means a stale mark. */
  outlierVenue: VenueId | null;
  confidence: ArbConfidence;
  lighterVolume24h: number | null;
  lighterOpenInterest: number | null;
}

export interface VenueStatus {
  ok: boolean;
  count: number;
  error?: string;
}

export interface ArbSnapshot {
  markets: ArbMarket[];
  venues: Record<VenueId, VenueStatus>;
  /** Tickers on 2+ venues whose prices never agreed — dropped as collisions. */
  ambiguousCount: number;
  updatedAt: number;
}

interface ParsedQuote {
  nativeSymbol: string;
  multiplier: number;
  rawPrice: number;
  unitPrice: number;
  volume24h?: number;
  openInterest?: number;
}

type VenueQuotes = Map<string, ParsedQuote[]>;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function stripQuote(symbol: string): string {
  let s = symbol.toUpperCase().replace(/[-_/]/g, "");
  s = s.replace(/SWAP$/, "").replace(/PERP$/, "");
  for (const quote of ["USDT", "USDC", "USD"]) {
    if (s.endsWith(quote) && s.length > quote.length + 1) {
      s = s.slice(0, -quote.length);
      break;
    }
  }
  return s;
}

function parseMultiplier(contract: string): { base: string; multiplier: number } {
  const match = contract.match(MULT_RE);
  if (match) return { multiplier: Number(match[1]), base: match[2] };
  return { multiplier: 1, base: contract };
}

function parseCexSymbol(raw: string): { base: string; multiplier: number } {
  return parseMultiplier(stripQuote(raw));
}

function parseHyperliquidCoin(coin: string): { base: string; multiplier: number } {
  if (coin.length > 2 && coin.startsWith("k") && coin[1] >= "A" && coin[1] <= "Z") {
    return { base: coin.slice(1).toUpperCase(), multiplier: 1000 };
  }
  return parseMultiplier(coin.toUpperCase());
}

function quoteFrom(
  nativeSymbol: string,
  price: number,
  parsed: { base: string; multiplier: number },
  extra?: { volume24h?: number; openInterest?: number }
): ParsedQuote | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const unitPrice = price / parsed.multiplier;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return {
    nativeSymbol,
    multiplier: parsed.multiplier,
    rawPrice: price,
    unitPrice,
    ...extra,
  };
}

/**
 * Keeps every contract variant a venue lists for a ticker. A venue can list two
 * unrelated assets under one base, so the right variant can only be chosen later,
 * once the cross-venue consensus price is known.
 */
function addQuote(map: VenueQuotes, base: string, quote: ParsedQuote | null): void {
  if (!quote || SKIP_BASES.has(base) || base.length < 2) return;
  const list = map.get(base);
  if (!list) {
    map.set(base, [quote]);
    return;
  }
  if (list.some((q) => q.nativeSymbol === quote.nativeSymbol)) return;
  list.push(quote);
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 9000): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchLighterQuotes(): Promise<VenueQuotes> {
  const data = (await fetchJson("/lighter-api/orderBookDetails")) as {
    order_book_details?: Array<{
      symbol?: string;
      status?: string;
      market_type?: string;
      mark_price?: string | number;
      index_price?: string | number;
      last_trade_price?: string | number;
      daily_quote_token_volume?: number;
      open_interest?: number;
    }>;
  };
  const map: VenueQuotes = new Map();
  for (const row of data.order_book_details ?? []) {
    if (!row.symbol) continue;
    if (row.status && row.status !== "active") continue;
    if (row.market_type && row.market_type !== "perp") continue;
    // Mark price first: last trade goes stale on thin books and invents gaps.
    const price =
      toNumber(row.mark_price) ?? toNumber(row.index_price) ?? toNumber(row.last_trade_price);
    if (price == null) continue;
    const parsed = parseMultiplier(row.symbol.toUpperCase());
    addQuote(
      map,
      parsed.base,
      quoteFrom(row.symbol, price, parsed, {
        volume24h: toNumber(row.daily_quote_token_volume) ?? undefined,
        openInterest: toNumber(row.open_interest) ?? undefined,
      })
    );
  }
  return map;
}

async function fetchHyperliquidQuotes(): Promise<VenueQuotes> {
  const data = (await fetchJson("/hyperliquid-api/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  })) as [
    { universe?: Array<{ name: string; isDelisted?: boolean }> },
    Array<{ markPx?: string; midPx?: string; oraclePx?: string }>,
  ];
  const universe = data[0]?.universe ?? [];
  const ctxs = data[1] ?? [];
  const map: VenueQuotes = new Map();
  universe.forEach((asset, i) => {
    if (!asset?.name || asset.isDelisted) return;
    const ctx = ctxs[i];
    const price = toNumber(ctx?.markPx) ?? toNumber(ctx?.midPx) ?? toNumber(ctx?.oraclePx);
    if (price == null) return;
    const parsed = parseHyperliquidCoin(asset.name);
    addQuote(map, parsed.base, quoteFrom(asset.name, price, parsed));
  });
  return map;
}

async function fetchBinanceStyleQuotes(path: string): Promise<VenueQuotes> {
  const data = (await fetchJson(path)) as Array<{
    symbol?: string;
    markPrice?: string | number;
    indexPrice?: string | number;
  }>;
  const map: VenueQuotes = new Map();
  for (const row of data ?? []) {
    if (!row.symbol || !row.symbol.endsWith("USDT")) continue;
    const price = toNumber(row.markPrice) ?? toNumber(row.indexPrice);
    if (price == null) continue;
    const parsed = parseCexSymbol(row.symbol);
    addQuote(map, parsed.base, quoteFrom(row.symbol, price, parsed));
  }
  return map;
}

async function fetchBybitQuotes(): Promise<VenueQuotes> {
  const data = (await fetchJson("/bybit-api/v5/market/tickers?category=linear")) as {
    result?: {
      list?: Array<{
        symbol?: string;
        markPrice?: string;
        lastPrice?: string;
        indexPrice?: string;
      }>;
    };
  };
  const map: VenueQuotes = new Map();
  for (const row of data.result?.list ?? []) {
    if (!row.symbol?.endsWith("USDT")) continue;
    const price = toNumber(row.markPrice) ?? toNumber(row.lastPrice) ?? toNumber(row.indexPrice);
    if (price == null) continue;
    const parsed = parseCexSymbol(row.symbol);
    addQuote(map, parsed.base, quoteFrom(row.symbol, price, parsed));
  }
  return map;
}

async function fetchOkxQuotes(): Promise<VenueQuotes> {
  const data = (await fetchJson("/okx-api/v5/market/tickers?instType=SWAP")) as {
    data?: Array<{
      instId?: string;
      markPx?: string;
      last?: string;
    }>;
  };
  const map: VenueQuotes = new Map();
  for (const row of data.data ?? []) {
    const instId = row.instId ?? "";
    if (!instId.endsWith("-USDT-SWAP")) continue;
    const price = toNumber(row.markPx) ?? toNumber(row.last);
    if (price == null) continue;
    const parsed = parseCexSymbol(instId);
    addQuote(map, parsed.base, quoteFrom(instId, price, parsed));
  }
  return map;
}

async function fetchBitgetQuotes(): Promise<VenueQuotes> {
  const data = (await fetchJson(
    "/bitget-api/api/v2/mix/market/tickers?productType=USDT-FUTURES"
  )) as {
    data?: Array<{
      symbol?: string;
      markPrice?: string;
      lastPr?: string;
      indexPrice?: string;
    }>;
  };
  const map: VenueQuotes = new Map();
  for (const row of data.data ?? []) {
    if (!row.symbol) continue;
    const price = toNumber(row.markPrice) ?? toNumber(row.lastPr) ?? toNumber(row.indexPrice);
    if (price == null) continue;
    const parsed = parseCexSymbol(row.symbol);
    addQuote(map, parsed.base, quoteFrom(row.symbol, price, parsed));
  }
  return map;
}

const FETCHERS: Record<VenueId, () => Promise<VenueQuotes>> = {
  lighter: fetchLighterQuotes,
  hyperliquid: fetchHyperliquidQuotes,
  binance: () => fetchBinanceStyleQuotes("/binance-fapi/v1/premiumIndex"),
  bybit: fetchBybitQuotes,
  okx: fetchOkxQuotes,
  bitget: fetchBitgetQuotes,
  aster: () => fetchBinanceStyleQuotes("/aster-api/v1/premiumIndex"),
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

interface Candidate extends ParsedQuote {
  venue: VenueId;
}

/**
 * Finds the run of candidate prices that all sit within MATCH_TOLERANCE of their own
 * median, preferring the run spanning the most venues. Candidates left outside it are
 * different assets wearing the same ticker.
 */
function consensusCluster(candidates: Candidate[]): Candidate[] | null {
  const sorted = [...candidates].sort((a, b) => a.unitPrice - b.unitPrice);
  let best: Candidate[] | null = null;
  let bestScore = -1;

  for (let i = 0; i < sorted.length; i += 1) {
    const group: Candidate[] = [];
    for (let j = i; j < sorted.length; j += 1) {
      const next = [...group, sorted[j]];
      const mid = median(next.map((q) => q.unitPrice));
      if (mid <= 0) break;
      if (!next.every((q) => Math.abs(q.unitPrice - mid) / mid <= MATCH_TOLERANCE)) break;
      group.push(sorted[j]);
    }
    if (!group.length) continue;
    const venues = new Set(group.map((q) => q.venue)).size;
    const score = venues * 1000 + group.length;
    if (score > bestScore) {
      bestScore = score;
      best = group;
    }
  }

  return best;
}

function displayFor(base: string, quotes: ArbQuote[]): { display: string; displayScale: number } {
  const lighter = quotes.find((q) => q.venue === "lighter");
  const raw = lighter?.multiplier ?? median(quotes.map((q) => q.multiplier));
  const scale = Number.isFinite(raw) && raw >= 1 ? raw : 1;
  return {
    display: scale > 1 ? `${scale}${base}` : base,
    displayScale: scale,
  };
}

/**
 * The venue whose removal shrinks the gap the most, when it alone is driving it.
 * Dropping either extreme of three evenly spread quotes already halves the range, so
 * the bar sits below that: only a venue that leaves the rest nearly flat counts.
 */
const OUTLIER_COLLAPSE = 0.4;

function findOutlier(quotes: ArbQuote[], gapBps: number): VenueId | null {
  if (quotes.length < 3 || gapBps <= 0) return null;
  let bestVenue: VenueId | null = null;
  let bestRemaining = gapBps;
  for (const candidate of quotes) {
    const rest = quotes.filter((q) => q.venue !== candidate.venue);
    if (rest.length < 2) continue;
    const prices = rest.map((q) => q.unitPrice);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const remaining = lo > 0 ? ((hi - lo) / lo) * 10000 : gapBps;
    if (remaining < bestRemaining) {
      bestRemaining = remaining;
      bestVenue = candidate.venue;
    }
  }
  return bestRemaining <= gapBps * OUTLIER_COLLAPSE ? bestVenue : null;
}

function confidenceFor(
  venueCount: number,
  excludedCount: number,
  gapBps: number,
  outlierVenue: VenueId | null
): ArbConfidence {
  // A gap that disappears once one venue is removed is that venue's stale mark, not
  // a dislocation anyone can trade, so it ranks below a thin-but-genuine spread.
  if (venueCount <= 2 || outlierVenue || gapBps > 400) return "low";
  if (excludedCount > 0 || venueCount === 3) return "medium";
  return "high";
}

function buildMarkets(venueMaps: Record<VenueId, VenueQuotes | null>): {
  markets: ArbMarket[];
  ambiguousCount: number;
} {
  const bases = new Set<string>();
  for (const map of Object.values(venueMaps)) {
    if (!map) continue;
    for (const base of map.keys()) bases.add(base);
  }

  const markets: ArbMarket[] = [];
  let ambiguousCount = 0;

  for (const base of bases) {
    const candidates: Candidate[] = [];
    for (const venue of VENUES) {
      for (const parsed of venueMaps[venue.id]?.get(base) ?? []) {
        candidates.push({ venue: venue.id, ...parsed });
      }
    }
    if (new Set(candidates.map((c) => c.venue)).size < 2) continue;

    const cluster = consensusCluster(candidates);
    if (!cluster || new Set(cluster.map((c) => c.venue)).size < 2) {
      ambiguousCount += 1;
      continue;
    }

    const consensus = median(cluster.map((c) => c.unitPrice));
    if (!(consensus > 0)) {
      ambiguousCount += 1;
      continue;
    }

    // One quote per venue: the contract variant closest to the consensus.
    const picked = new Map<VenueId, Candidate>();
    for (const candidate of cluster) {
      const current = picked.get(candidate.venue);
      if (
        !current ||
        Math.abs(candidate.unitPrice - consensus) < Math.abs(current.unitPrice - consensus)
      ) {
        picked.set(candidate.venue, candidate);
      }
    }

    const quotes: ArbQuote[] = [];
    const byVenue: Partial<Record<VenueId, ArbQuote>> = {};
    for (const venue of VENUES) {
      const candidate = picked.get(venue.id);
      if (!candidate) continue;
      const quote: ArbQuote = {
        venue: venue.id,
        nativeSymbol: candidate.nativeSymbol,
        multiplier: candidate.multiplier,
        rawPrice: candidate.rawPrice,
        unitPrice: candidate.unitPrice,
        devBps: ((candidate.unitPrice - consensus) / consensus) * 10000,
      };
      quotes.push(quote);
      byVenue[venue.id] = quote;
    }
    if (quotes.length < 2) {
      ambiguousCount += 1;
      continue;
    }

    let low = quotes[0];
    let high = quotes[0];
    for (const quote of quotes) {
      if (quote.unitPrice < low.unitPrice) low = quote;
      if (quote.unitPrice > high.unitPrice) high = quote;
    }
    if (low.unitPrice <= 0) continue;

    const gapAbs = high.unitPrice - low.unitPrice;
    const gapPct = (gapAbs / low.unitPrice) * 100;
    const gapBps = gapPct * 100;
    if (gapBps > MAX_PLAUSIBLE_BPS) {
      ambiguousCount += 1;
      continue;
    }

    const excludedCount = candidates.length - cluster.length;
    const outlierVenue = findOutlier(quotes, gapBps);
    const feeBps = VENUE_BY_ID[low.venue].takerBps + VENUE_BY_ID[high.venue].takerBps;
    const lighterQuote = picked.get("lighter");
    const { display, displayScale } = displayFor(base, quotes);

    markets.push({
      base,
      display,
      displayScale,
      consensus,
      quotes,
      byVenue,
      low,
      high,
      gapAbs,
      gapPct,
      gapBps,
      netBps: gapBps - feeBps,
      venueCount: quotes.length,
      excludedCount,
      outlierVenue,
      confidence: confidenceFor(quotes.length, excludedCount, gapBps, outlierVenue),
      lighterVolume24h: lighterQuote?.volume24h ?? null,
      lighterOpenInterest: lighterQuote?.openInterest ?? null,
    });
  }

  markets.sort((a, b) => b.gapBps - a.gapBps);
  return { markets, ambiguousCount };
}

export async function fetchArbSnapshot(): Promise<ArbSnapshot> {
  const entries = await Promise.all(
    VENUES.map(async (venue) => {
      try {
        const map = await FETCHERS[venue.id]();
        return [venue.id, { ok: true as const, map }] as const;
      } catch (err: unknown) {
        let message = "Failed";
        if (err instanceof Error) message = err.name === "AbortError" ? "Timed out" : err.message;
        return [venue.id, { ok: false as const, error: message }] as const;
      }
    })
  );

  const venueMaps = {} as Record<VenueId, VenueQuotes | null>;
  const venues = {} as Record<VenueId, VenueStatus>;
  for (const [id, result] of entries) {
    if (result.ok) {
      venueMaps[id] = result.map;
      venues[id] = { ok: true, count: result.map.size };
    } else {
      venueMaps[id] = null;
      venues[id] = { ok: false, count: 0, error: result.error };
    }
  }

  const { markets, ambiguousCount } = buildMarkets(venueMaps);

  return {
    markets,
    venues,
    ambiguousCount,
    updatedAt: Date.now(),
  };
}

export function formatArbPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  const abs = Math.abs(price);
  if (abs >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 100) return price.toFixed(3);
  if (abs >= 1) return price.toFixed(4);
  if (abs >= 0.1) return price.toFixed(5);
  if (abs >= 0.01) return price.toFixed(6);
  if (abs >= 0.0001) return price.toFixed(7);
  return price.toPrecision(4);
}

export function formatBps(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const abs = Math.abs(bps);
  if (abs >= 100) return `${bps.toFixed(0)} bps`;
  if (abs >= 10) return `${bps.toFixed(1)} bps`;
  return `${bps.toFixed(2)} bps`;
}

/** Per-venue deviation, written as a signed bps number with no unit. */
export function formatSignedBps(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const abs = Math.abs(bps);
  if (abs < 0.05) return "0";
  const sign = bps > 0 ? "+" : "−";
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(1)}`;
}

export function formatGapPct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  if (pct >= 1) return `${sign}${pct.toFixed(2)}%`;
  return `${sign}${pct.toFixed(3)}%`;
}

export function formatUsdCompact(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function displayPrice(market: ArbMarket, quote: ArbQuote | undefined): number | null {
  if (!quote) return null;
  return quote.unitPrice * market.displayScale;
}

export function consensusDisplayPrice(market: ArbMarket): number {
  return market.consensus * market.displayScale;
}
