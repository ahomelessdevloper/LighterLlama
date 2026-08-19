import { formatUSD } from "./api";

const LLAMA = "/llama-api";
const LLAMA_DIRECT = "https://api.llama.fi";
const COINGECKO = "/coingecko-api";
const TOP_COUNT = 50;
const PERP_CATEGORIES = new Set(["Derivatives"]);
const SHORT_BRANDS = new Set(["gmx", "nado", "aevo", "dydx", "mux"]);
const CEX_NAME_RE =
  /\b(binance|okx|okex|bybit|mexc|bitget|bingx|kucoin|bitfinex|deribit|kraken|htx|huobi|bitmex|phemex|coinex|whitebit|lbank|toobit|weex|kcex|coinw|tapbit|orangex|ourbit|deepcoin|bvox|hotcoin|coinbase|gemini|bitstamp|crypto\.com|xt\.com|xt com)\b/i;

export interface PerpDexRow {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  chains: string[];
  volume24h: number | null;
  oi: number;
  oiChange1d: number | null;
  tvl: number | null;
  fees24h: number | null;
  execCostBps: number | null;
}

export interface PerpDexSnapshot {
  rows: PerpDexRow[];
  updatedAt: number;
  totals: {
    volume24h: number;
    oi: number;
    tvl: number;
  };
}

interface LlamaOiProtocol {
  total24h?: number | null;
  change_1d?: number | null;
  name: string;
  displayName?: string;
  slug: string;
  category?: string;
  logo?: string;
  chains?: string[];
  parentProtocol?: string | null;
}

interface LlamaOiOverview {
  protocols?: LlamaOiProtocol[];
}

interface CoinGeckoDerivativeExchange {
  id: string;
  name: string;
  open_interest_btc?: number | null;
  trade_volume_24h_btc?: string | number | null;
}

interface PerpGroup {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  chains: string[];
  oi: number;
  oiChange1d: number | null;
  childSlugs: string[];
  matchKeys: string[];
}

const STOP_TOKENS = new Set([
  "perps",
  "perp",
  "perpetual",
  "perpetuals",
  "futures",
  "derivatives",
  "exchange",
  "protocol",
  "network",
  "chain",
  "omni",
  "dex",
  "v1",
  "v2",
  "v3",
  "v4",
  "app",
  "finance",
  "trade",
  "trading",
  "markets",
  "market",
  "labs",
  "the",
]);

function parentSlugOf(protocol: LlamaOiProtocol): string {
  const parent = protocol.parentProtocol;
  if (parent?.startsWith("parent#")) return parent.slice(7);
  return protocol.slug.replace(/-perps(?:-.*)?$/, "");
}

function cleanDexName(name: string): string {
  const cleaned = name
    .replace(/\s+perpetual exchange$/i, "")
    .replace(/\s+perps$/i, "")
    .replace(/\s+v\d+$/i, "")
    .trim();
  return cleaned || name;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !STOP_TOKENS.has(token))
    .join(" ")
    .trim();
}

function keysFor(name: string, slug?: string | null): string[] {
  const keys = new Set<string>();
  const named = normalizeKey(name);
  if (named) keys.add(named);
  if (slug) {
    const slugged = normalizeKey(slug.replace(/-/g, " "));
    if (slugged) keys.add(slugged);
  }
  for (const key of [...keys]) {
    const first = key.split(" ")[0];
    if (first && (first.length >= 4 || SHORT_BRANDS.has(first))) keys.add(first);
    const sorted = key.split(" ").filter(Boolean).sort().join(" ");
    if (sorted) keys.add(sorted);
  }
  return [...keys];
}

function isProbablyCex(exchange: CoinGeckoDerivativeExchange): boolean {
  const blob = `${exchange.id} ${exchange.name}`;
  if (CEX_NAME_RE.test(blob)) return true;
  if (/\bgate\b/i.test(blob) && !/\bdex\b/i.test(blob)) return true;
  return false;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function fetchNumber(url: string): Promise<number | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const text = await res.text();
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchLlamaJson<T>(path: string): Promise<T> {
  try {
    return await fetchJson<T>(`${LLAMA}${path}`);
  } catch {
    return await fetchJson<T>(`${LLAMA_DIRECT}${path}`);
  }
}

async function fetchLlamaNumber(path: string): Promise<number | null> {
  const proxied = await fetchNumber(`${LLAMA}${path}`);
  if (proxied != null) return proxied;
  return fetchNumber(`${LLAMA_DIRECT}${path}`);
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    out.push(...(await Promise.all(chunk.map(mapper))));
  }
  return out;
}

function aggregatePerpGroups(protocols: LlamaOiProtocol[]): PerpGroup[] {
  const groups = new Map<string, PerpGroup>();

  for (const protocol of protocols) {
    if (!PERP_CATEGORIES.has(protocol.category ?? "")) continue;
    const oi = protocol.total24h ?? 0;
    if (!(oi > 0)) continue;

    const id = parentSlugOf(protocol);
    const existing = groups.get(id);
    const name = cleanDexName(protocol.displayName || protocol.name);
    const matchKeys = keysFor(name, protocol.slug).concat(keysFor(id, id));

    if (!existing) {
      groups.set(id, {
        id,
        name,
        slug: protocol.slug,
        logo: protocol.logo ?? null,
        chains: [...(protocol.chains ?? [])],
        oi,
        oiChange1d: protocol.change_1d ?? null,
        childSlugs: [protocol.slug],
        matchKeys,
      });
      continue;
    }

    const nextOi = existing.oi + oi;
    const nextChange =
      existing.oiChange1d != null && protocol.change_1d != null
        ? (existing.oiChange1d * existing.oi + protocol.change_1d * oi) / nextOi
        : existing.oiChange1d ?? protocol.change_1d ?? null;

    existing.oi = nextOi;
    existing.oiChange1d = nextChange;
    existing.childSlugs.push(protocol.slug);
    existing.chains = [...new Set([...existing.chains, ...(protocol.chains ?? [])])];
    existing.matchKeys = [...new Set([...existing.matchKeys, ...matchKeys])];
    if (oi >= existing.oi - oi) {
      existing.name = name;
      existing.slug = protocol.slug;
      existing.logo = protocol.logo ?? existing.logo;
    }
  }

  return [...groups.values()].sort((a, b) => b.oi - a.oi);
}

function assignVolumes(
  groups: PerpGroup[],
  exchanges: CoinGeckoDerivativeExchange[],
  btcUsd: number
): Map<string, number> {
  const volumes = new Map<string, number>();
  if (!(btcUsd > 0)) return volumes;

  for (const exchange of exchanges) {
    if (isProbablyCex(exchange)) continue;
    const btc = Number(exchange.trade_volume_24h_btc);
    if (!Number.isFinite(btc) || btc <= 0) continue;

    let best: PerpGroup | null = null;
    let bestScore = 0;
    const exchangeKeys = keysFor(exchange.name, exchange.id);
    const blob = normalizeKey(`${exchange.name} ${exchange.id}`);

    for (const group of groups) {
      const groupKeys = new Set(group.matchKeys);
      let score = 0;
      for (const key of exchangeKeys) {
        if (groupKeys.has(key)) score += (key.includes(" ") ? 30 : 12) + key.length;
      }
      const brand = normalizeKey(group.id);
      if (brand.length >= 4 && new RegExp(`(?:^| )${brand}(?: |$)`).test(blob)) {
        score += 8;
      }
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    }

    if (best && bestScore >= 12) {
      volumes.set(best.id, (volumes.get(best.id) ?? 0) + btc * btcUsd);
    }
  }

  return volumes;
}

async function fetchTvlForGroup(group: PerpGroup): Promise<number | null> {
  const candidates = [
    group.id,
    group.slug.replace(/-perps(?:-.*)?$/, ""),
    group.slug,
  ].filter((slug, index, list) => slug && list.indexOf(slug) === index);

  for (const slug of candidates) {
    const tvl = await fetchLlamaNumber(`/tvl/${encodeURIComponent(slug)}`);
    if (tvl != null) return tvl;
  }
  return null;
}

async function fetchFees24h(slug: string): Promise<number | null> {
  try {
    const data = await fetchLlamaJson<{ total24h?: number | null }>(
      `/summary/fees/${encodeURIComponent(slug)}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`
    );
    const value = data.total24h;
    return value != null && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function fetchTopPerpDexes(): Promise<PerpDexSnapshot> {
  const oiPromise = fetchLlamaJson<LlamaOiOverview>(
    "/overview/open-interest?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=openInterestAtEnd"
  );

  const volumePromise = Promise.all([
    fetchJson<CoinGeckoDerivativeExchange[]>(
      `${COINGECKO}/derivatives/exchanges?per_page=250&order=trade_volume_24h_btc_desc`
    ).catch(() =>
      fetchJson<CoinGeckoDerivativeExchange[]>(
        `${COINGECKO}/derivatives/exchanges?per_page=100&order=trade_volume_24h_btc_desc`
      )
    ).catch(() => [] as CoinGeckoDerivativeExchange[]),
    fetchJson<{ bitcoin?: { usd?: number } }>(
      `${COINGECKO}/simple/price?ids=bitcoin&vs_currencies=usd`
    ).catch(() => ({ bitcoin: { usd: 0 } })),
  ]);

  const [oiOverview, [exchanges, btcPrice]] = await Promise.all([oiPromise, volumePromise]);
  const groups = aggregatePerpGroups(oiOverview.protocols ?? []).slice(0, TOP_COUNT);
  if (!groups.length) {
    throw new Error("No perp DEX data returned");
  }

  const btcUsd = btcPrice.bitcoin?.usd ?? 0;
  const volumeLookup = assignVolumes(groups, exchanges, btcUsd);

  const feeSlugs = [...new Set(groups.flatMap((group) => group.childSlugs))];
  const [feeEntries, tvlEntries] = await Promise.all([
    mapPool(feeSlugs, 8, async (slug) => {
      return [slug, await fetchFees24h(slug)] as const;
    }),
    mapPool(groups, 8, async (group) => {
      return [group.id, await fetchTvlForGroup(group)] as const;
    }),
  ]);
  const feeBySlug = new Map(feeEntries);
  const tvlById = new Map(tvlEntries);

  const enriched = groups.map((group) => {
    const fees24h = group.childSlugs.reduce((sum, slug) => sum + (feeBySlug.get(slug) ?? 0), 0);
    const volume24h = volumeLookup.get(group.id) ?? null;
    const feesValue = fees24h > 0 ? fees24h : null;
    const execCostBps =
      feesValue != null && volume24h != null && volume24h > 0
        ? (feesValue / volume24h) * 10_000
        : null;

    const row: PerpDexRow = {
      id: group.id,
      name: group.name,
      slug: group.slug,
      logo: group.logo,
      chains: group.chains,
      volume24h,
      oi: group.oi,
      oiChange1d: group.oiChange1d,
      tvl: tvlById.get(group.id) ?? null,
      fees24h: feesValue,
      execCostBps,
    };
    return row;
  });

  return {
    rows: enriched,
    updatedAt: Date.now(),
    totals: {
      volume24h: enriched.reduce((sum, row) => sum + (row.volume24h ?? 0), 0),
      oi: enriched.reduce((sum, row) => sum + row.oi, 0),
      tvl: enriched.reduce((sum, row) => sum + (row.tvl ?? 0), 0),
    },
  };
}

export function formatExecBps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  if (value >= 100) return `${value.toFixed(1)} bps`;
  if (value >= 1) return `${value.toFixed(2)} bps`;
  return `${value.toFixed(3)} bps`;
}

export function formatUsdMetric(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatUSD(value, true);
}
