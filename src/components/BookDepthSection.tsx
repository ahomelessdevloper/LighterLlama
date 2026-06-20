import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { ChartDownloadButton } from "./ChartDownloadButton";
import { ComparePageTitle } from "./compare/shared";
import { chartDownloadFilename } from "../lib/chartDownload";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { formatStatValue } from "../lib/compareFormat";
import { VenueDuel, VenueLogo, VENUES, type VenueId } from "./VenueBrand";
import {
  buildVenueDepthProfile,
  DEPTH_RANGES,
  fetchCompareMarkets,
  fetchHyperliquidBookDepth,
  fetchLighterBookDepth,
  formatMidPrice,
  getDepthWithinRange,
  type BookDepthSnapshot,
  type CompareMarket,
  type DepthRange,
  type DepthXAxisMode,
  type VenueDepthPoint,
} from "../lib/bookDepth";

const REFRESH_MS = 8000;

type VenueTheme = {
  id: VenueId;
  name: string;
  accent: string;
  bidStroke: string;
  askStroke: string;
};

const THEMES: Record<VenueId, VenueTheme> = {
  hyperliquid: {
    id: "hyperliquid",
    name: VENUES.hyperliquid.name,
    accent: VENUES.hyperliquid.color,
    bidStroke: "#22c55e",
    askStroke: "#fbbf24",
  },
  lighter: {
    id: "lighter",
    name: VENUES.lighter.name,
    accent: VENUES.lighter.color,
    bidStroke: "#06b6d4",
    askStroke: "#fb7185",
  },
};

function VenueTooltip({
  active,
  payload,
  label,
  theme,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  theme: VenueTheme;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="depth-tooltip" style={{ borderColor: theme.accent }}>
      <p className="depth-tooltip__venue" style={{ color: theme.accent }}>
        {theme.name}
      </p>
      {label && <p className="depth-tooltip__label">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="depth-tooltip__row">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span>{formatStatValue(entry.value ?? null, "currency")}</span>
        </p>
      ))}
    </div>
  );
}

function depthAdvantage(
  a: number,
  b: number
): { leader: "hyperliquid" | "lighter" | "tie"; pct: number } {
  if (a <= 0 && b <= 0) return { leader: "tie", pct: 0 };
  if (a === b) return { leader: "tie", pct: 0 };
  const leader = a > b ? "hyperliquid" : "lighter";
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return { leader, pct: lo > 0 ? ((hi - lo) / lo) * 100 : 100 };
}

function DepthSummaryStrip({
  hl,
  lighter,
}: {
  hl: { bidUsd: number; askUsd: number; totalUsd: number };
  lighter: { bidUsd: number; askUsd: number; totalUsd: number };
}) {
  const rows = [
    { key: "bid", label: "Bid depth", hl: hl.bidUsd, lighter: lighter.bidUsd },
    { key: "ask", label: "Ask depth", hl: hl.askUsd, lighter: lighter.askUsd },
    { key: "total", label: "Total depth", hl: hl.totalUsd, lighter: lighter.totalUsd },
  ] as const;

  return (
    <div className="depth-summary">
      {rows.map((row) => {
        const adv = depthAdvantage(row.hl, row.lighter);
        const hlWins = adv.leader === "hyperliquid";
        const lWins = adv.leader === "lighter";
        const max = Math.max(row.hl, row.lighter, 1);
        return (
          <div key={row.key} className="depth-summary__row">
            <span className="depth-summary__label">{row.label}</span>
            <div className="depth-summary__bars">
              <div className="depth-summary__bar depth-summary__bar--hl">
                <span
                  className={`depth-summary__fill ${hlWins ? "depth-summary__fill--win" : ""}`}
                  style={{ width: `${(row.hl / max) * 100}%` }}
                />
                <span className="depth-summary__val">{formatStatValue(row.hl, "currency")}</span>
              </div>
              <div className="depth-summary__bar depth-summary__bar--l">
                <span
                  className={`depth-summary__fill ${lWins ? "depth-summary__fill--win" : ""}`}
                  style={{ width: `${(row.lighter / max) * 100}%` }}
                />
                <span className="depth-summary__val">{formatStatValue(row.lighter, "currency")}</span>
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}

function VenuePriceCard({
  theme,
  book,
  stats,
}: {
  theme: VenueTheme;
  book: BookDepthSnapshot | null;
  stats: { bidUsd: number; askUsd: number; totalUsd: number } | null;
}) {
  const bidPct = stats && stats.totalUsd > 0 ? (stats.bidUsd / stats.totalUsd) * 100 : 50;
  const bestBid = book?.bids[0]?.px ?? null;
  const bestAsk = book?.asks[0]?.px ?? null;

  return (
    <article className={`depth-venue-tile depth-venue-tile--${theme.id}`}>
      <div className="depth-venue-tile__glow" aria-hidden="true" />
      <div className="depth-venue-tile__top">
        <span className="depth-venue-tile__badge">
          <VenueLogo venue={theme.id} size="sm" />
        </span>
        <span className="depth-venue-tile__name">{theme.name}</span>
      </div>
      <p className="depth-venue-tile__mid">{formatMidPrice(book?.mid ?? null)}</p>
      <div className="depth-venue-tile__quotes">
        <span>
          <em>Bid</em> {bestBid != null ? formatMidPrice(bestBid) : "—"}
        </span>
        <span>
          <em>Ask</em> {bestAsk != null ? formatMidPrice(bestAsk) : "—"}
        </span>
      </div>
      <div className="depth-venue-tile__meta">
        <span>Spread {book?.spreadBps != null ? `${book.spreadBps.toFixed(2)} bps` : "—"}</span>
        <span>±{formatStatValue(stats?.totalUsd ?? null, "currency")}</span>
      </div>
      <div className="depth-venue-tile__split">
        <span className="depth-venue-tile__bid" style={{ width: `${bidPct}%` }} />
        <span className="depth-venue-tile__ask" style={{ width: `${100 - bidPct}%` }} />
      </div>
      <div className="depth-venue-tile__legs">
        <span>Bid {formatStatValue(stats?.bidUsd ?? null, "currency")}</span>
        <span>Ask {formatStatValue(stats?.askUsd ?? null, "currency")}</span>
      </div>
    </article>
  );
}

function MirroredDepthChart({
  theme,
  data,
  xMode,
  filename,
}: {
  theme: VenueTheme;
  data: VenueDepthPoint[];
  xMode: DepthXAxisMode;
  filename: string;
}) {
  const captureRef = useRef<HTMLElement>(null);
  const maxY = useMemo(
    () => Math.max(...data.flatMap((p) => [p.bid ?? 0, p.ask ?? 0]), 1),
    [data]
  );

  return (
    <article ref={captureRef} className={`depth-venue-card depth-venue-card--${theme.id} downloadable-block`}>
      <ChartDownloadButton targetRef={captureRef} filename={filename} className="downloadable-block__dl" />
      <div className="depth-venue-card__ribbon" aria-hidden="true" />
      <div className="depth-venue-card__glow" aria-hidden="true" />
      <div className="depth-venue-card__head">
        <div className="depth-venue-card__title">
          <span className="depth-venue-card__dot" />
          <span>{theme.name}</span>
        </div>
        <div className="depth-venue-card__legend">
          <span className="depth-legend-pill depth-legend-pill--bid">Bid</span>
          <span className="depth-legend-pill depth-legend-pill--ask">Ask</span>
        </div>
      </div>

      <div className="depth-venue-chart compare-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 4 }}>
            <defs>
              <linearGradient id={`${theme.id}BidGrad`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={theme.bidStroke} stopOpacity={0.65} />
                <stop offset="100%" stopColor={theme.bidStroke} stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id={`${theme.id}AskGrad`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={theme.askStroke} stopOpacity={0.04} />
                <stop offset="100%" stopColor={theme.askStroke} stopOpacity={0.65} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 8" stroke="rgba(51, 65, 85, 0.45)" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(71, 85, 105, 0.5)" }}
              tickFormatter={(v) => {
                if (xMode === "price") {
                  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
                }
                return v === 0 ? "Mid" : `${Math.abs(Number(v)).toFixed(0)}`;
              }}
            />
            <YAxis hide domain={[0, maxY * 1.1]} />
            <Tooltip
              content={<VenueTooltip theme={theme} />}
              labelFormatter={(_, items) => {
                const pt = items?.[0]?.payload as VenueDepthPoint | undefined;
                return pt?.label ?? "";
              }}
            />
            <ReferenceLine x={0} stroke="rgba(148, 163, 184, 0.55)" strokeDasharray="4 4" />
            <Area
              type="stepAfter"
              dataKey="bid"
              name="Bid depth"
              stroke={theme.bidStroke}
              fill={`url(#${theme.id}BidGrad)`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Area
              type="stepAfter"
              dataKey="ask"
              name="Ask depth"
              stroke={theme.askStroke}
              fill={`url(#${theme.id}AskGrad)`}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function CompareBars({
  lighter,
  hyperliquid,
  range,
  market,
}: {
  lighter: { bid: number; ask: number };
  hyperliquid: { bid: number; ask: number };
  range: DepthRange;
  market: string;
}) {
  const captureRef = useRef<HTMLElement>(null);
  const rows = [
    { label: "Bid Depth", lighter: lighter.bid, hyperliquid: hyperliquid.bid },
    { label: "Ask Depth", lighter: lighter.ask, hyperliquid: hyperliquid.ask },
    {
      label: "Total Depth",
      lighter: lighter.bid + lighter.ask,
      hyperliquid: hyperliquid.bid + hyperliquid.ask,
    },
  ];
  const maxVal = Math.max(...rows.flatMap((r) => [r.lighter, r.hyperliquid]), 1);
  return (
    <article ref={captureRef} className="depth-compare-card downloadable-block">
      <ChartDownloadButton
        targetRef={captureRef}
        filename={chartDownloadFilename(`book-depth-compare-${market}`)}
        className="downloadable-block__dl"
      />
      <div className="depth-compare-card__head">
        <h3 className="depth-compare-card__title">Depth · ±{range}%</h3>
      </div>
      <div className="depth-compare-chart compare-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 14, left: 4, bottom: 0 }}
            barGap={4}
            barCategoryGap="24%"
          >
            <CartesianGrid strokeDasharray="2 6" stroke="rgba(51, 65, 85, 0.35)" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, maxVal * 1.12]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatStatValue(Number(v), "currency")}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={78}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="depth-tooltip">
                    <p className="depth-tooltip__label">{payload[0]?.payload?.label}</p>
                    {payload.map((entry, i) => (
                      <p key={i} className="depth-tooltip__row">
                        <span style={{ color: entry.color as string }}>{entry.name}</span>
                        <span>{formatStatValue(Number(entry.value), "currency")}</span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Bar dataKey="lighter" name="Lighter" radius={[0, 6, 6, 0]} maxBarSize={16}>
              {rows.map((_, i) => (
                <Cell key={`l-${i}`} fill="#22d3ee" fillOpacity={0.9} />
              ))}
            </Bar>
            <Bar dataKey="hyperliquid" name="Hyperliquid" radius={[0, 6, 6, 0]} maxBarSize={16}>
              {rows.map((_, i) => (
                <Cell key={`h-${i}`} fill="#4ade80" fillOpacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="depth-compare-legend venue-legend-row">
        <span className="venue-legend venue-legend--lighter">
          <VenueLogo venue="lighter" size="xs" />
          <span>Lighter</span>
        </span>
        <span className="venue-legend venue-legend--hyperliquid">
          <VenueLogo venue="hyperliquid" size="xs" />
          <span>Hyperliquid</span>
        </span>
      </div>
    </article>
  );
}

export function BookDepthSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [markets, setMarkets] = useState<CompareMarket[]>([]);
  const [market, setMarket] = useState<CompareMarket | null>(null);
  const [lighterBook, setLighterBook] = useState<BookDepthSnapshot | null>(null);
  const [hyperliquidBook, setHyperliquidBook] = useState<BookDepthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [range, setRange] = useState<DepthRange>(0.2);
  const [xMode, setXMode] = useState<DepthXAxisMode>("bps");
  const [hlFeeBps, setHlFeeBps] = useState("4.5");
  const [lighterFeeBps, setLighterFeeBps] = useState("0");

  useEffect(() => {
    fetchCompareMarkets()
      .then((list) => {
        setMarkets(list);
        const btc = list.find((m) => m.symbol === "BTC" && m.category === "crypto");
        setMarket(btc ?? list.find((m) => m.category === "crypto") ?? list[0] ?? null);
      })
      .catch(() => toast.error("Failed to load markets"));
  }, []);

  const loadBooks = useCallback(
    async (silent = false) => {
      if (!market) return;
      try {
        if (!silent) setLoading(true);
        const [lighter, hyperliquid] = await Promise.all([
          fetchLighterBookDepth(market),
          fetchHyperliquidBookDepth(market),
        ]);
        setLighterBook(lighter);
        setHyperliquidBook(hyperliquid);
        setConnected(true);
      } catch (err: unknown) {
        setConnected(false);
        if (!silent) {
          toast.error("Book depth failed", {
            description: err instanceof Error ? err.message : "Unknown error",
          });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [market]
  );

  useEffect(() => {
    loadBooks();
    const id = setInterval(() => loadBooks(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [loadBooks]);

  const hlProfile = useMemo(
    () => (hyperliquidBook ? buildVenueDepthProfile(hyperliquidBook, range, xMode) : []),
    [hyperliquidBook, range, xMode]
  );
  const lighterProfile = useMemo(
    () => (lighterBook ? buildVenueDepthProfile(lighterBook, range, xMode) : []),
    [lighterBook, range, xMode]
  );
  const hlStats = useMemo(
    () => (hyperliquidBook ? getDepthWithinRange(hyperliquidBook, range) : null),
    [hyperliquidBook, range]
  );
  const lighterStats = useMemo(
    () => (lighterBook ? getDepthWithinRange(lighterBook, range) : null),
    [lighterBook, range]
  );

  const byCategory = useMemo(() => {
    return {
      crypto: markets.filter((m) => m.category === "crypto"),
      rwa: markets.filter((m) => m.category === "rwa"),
      forex: markets.filter((m) => m.category === "forex"),
    };
  }, [markets]);

  const marketKey = market ? `${market.category}:${market.symbol}` : "";
  return (
    <section className="book-depth-section">
      <ComparePageTitle title="Book Depth" />

      <div ref={heroRef} className="depth-panel depth-panel--hero downloadable-block relative">
        <ChartDownloadButton
          targetRef={heroRef}
          filename={chartDownloadFilename(`book-depth-${market?.symbol ?? "market"}`)}
          className="downloadable-block__dl"
        />
        <div className="depth-panel__status">
          <span className={`depth-live-pill ${connected ? "depth-live-pill--on" : ""}`}>
            <Activity className={`depth-live-icon ${connected ? "depth-live-icon--on" : ""}`} />
            {connected ? "Live" : "Reconnecting"}
          </span>
          {market && (
            <span className="depth-panel__asset">
              {market.symbol}
              <em>{market.category}</em>
            </span>
          )}
        </div>

        <div className="depth-venue-duel">
          <VenuePriceCard
            theme={THEMES.hyperliquid}
            book={hyperliquidBook}
            stats={hlStats}
          />
          <VenueDuel className="depth-venue-duel__vs" showNames={false} size="xs" />
          <VenuePriceCard
            theme={THEMES.lighter}
            book={lighterBook}
            stats={lighterStats}
          />
        </div>

        {hlStats && lighterStats && <DepthSummaryStrip hl={hlStats} lighter={lighterStats} />}
      </div>

      <div className="depth-panel depth-panel--controls">
        <div className="depth-control">
          <label htmlFor="depth-market-select" className="depth-control__label">
            Market
          </label>
          <select
            id="depth-market-select"
            className="depth-control__select"
            value={marketKey}
            onChange={(e) => {
              const [cat, symbol] = e.target.value.split(":");
              const found = markets.find(
                (m) => m.category === cat && m.symbol === symbol
              );
              if (found) setMarket(found);
            }}
          >
            <option value="" disabled>
              Select market
            </option>
            {(["crypto", "rwa", "forex"] as const).map((cat) => {
              const list = byCategory[cat];
              if (!list.length) return null;
              return (
                <optgroup key={cat} label={cat.toUpperCase()}>
                  {list.map((m) => (
                    <option key={m.symbol} value={`${m.category}:${m.symbol}`}>
                      {m.symbol}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className="depth-control">
          <span className="depth-control__label">X-axis</span>
          <div className="depth-segment">
            <button
              type="button"
              className={`depth-segment__btn ${xMode === "bps" ? "depth-segment__btn--active" : ""}`}
              onClick={() => setXMode("bps")}
            >
              BPs from Mid
            </button>
            <button
              type="button"
              className={`depth-segment__btn ${xMode === "price" ? "depth-segment__btn--active" : ""}`}
              onClick={() => setXMode("price")}
            >
              Price
            </button>
          </div>
        </div>

        <div className="depth-control depth-control--range">
          <span className="depth-control__label">Range</span>
          <div className="depth-range-pills">
            {DEPTH_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`depth-range-pill ${range === r ? "depth-range-pill--active" : ""}`}
                onClick={() => setRange(r)}
              >
                ±{r}%
              </button>
            ))}
          </div>
        </div>

        <div className="depth-control depth-control--fees">
          <span className="depth-control__label">Fee (bps)</span>
          <div className="depth-fee-row">
            <label className="depth-fee depth-fee--hl">
              <span className="depth-fee__label">
                <VenueLogo venue="hyperliquid" size="xs" />
                Hyperliquid
              </span>
              <input value={hlFeeBps} onChange={(e) => setHlFeeBps(e.target.value)} />
            </label>
            <label className="depth-fee depth-fee--l">
              <span className="depth-fee__label">
                <VenueLogo venue="lighter" size="xs" />
                Lighter
              </span>
              <input value={lighterFeeBps} onChange={(e) => setLighterFeeBps(e.target.value)} />
            </label>
          </div>
        </div>
      </div>

      {loading && !lighterBook ? (
        <div className="depth-charts-layout depth-charts-layout--loading">
          <div className="depth-skeleton depth-skeleton--chart" />
          <div className="depth-skeleton depth-skeleton--chart" />
          <div className="depth-skeleton depth-skeleton--compare" />
        </div>
      ) : (
        <div className="depth-charts-layout">
          <MirroredDepthChart
            theme={THEMES.hyperliquid}
            data={hlProfile}
            xMode={xMode}
            filename={chartDownloadFilename(`book-depth-hl-${market?.symbol ?? "market"}`)}
          />
          <MirroredDepthChart
            theme={THEMES.lighter}
            data={lighterProfile}
            xMode={xMode}
            filename={chartDownloadFilename(`book-depth-l-${market?.symbol ?? "market"}`)}
          />
          {hlStats && lighterStats && (
            <CompareBars
              range={range}
              market={market?.symbol ?? "market"}
              lighter={{ bid: lighterStats.bidUsd, ask: lighterStats.askUsd }}
              hyperliquid={{ bid: hlStats.bidUsd, ask: hlStats.askUsd }}
            />
          )}
        </div>
      )}

    </section>
  );
}