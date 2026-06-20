import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LoadingState } from "./LoadingState";
import { ChartDownloadButton } from "./ChartDownloadButton";
import { chartDownloadFilename } from "../lib/chartDownload";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { formatUSD, formatNumber } from "../lib/api";
import {
  fetchLlpHlpSnapshots,
  formatApy,
  formatSharePrice,
  formatSharpe,
  type HlpSnapshot,
  type LlpSnapshot,
  type PoolComparePoint,
} from "../lib/llpHlp";
import {
  CHART_CURSOR,
  CompareLegend,
  CompareTooltip,
  LIGHTER_COLOR,
  HYPERLIQUID_COLOR,
} from "./compare/shared";

const REFRESH_MS = 60_000;

type CompareRow = {
  label: string;
  lighter: string;
  hyperliquid: string;
  highlight?: "lighter" | "hyperliquid" | null;
};

function metricWinner(
  lighter: number | null,
  hyperliquid: number | null,
  higherIsBetter = true
): "lighter" | "hyperliquid" | null {
  if (lighter == null || hyperliquid == null) return null;
  if (lighter === hyperliquid) return null;
  if (higherIsBetter) return lighter > hyperliquid ? "lighter" : "hyperliquid";
  return lighter < hyperliquid ? "lighter" : "hyperliquid";
}

function ApyCompareTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="compare-tooltip">
      {label && <p className="compare-tooltip__label">{label}</p>}
      {payload.map((entry, i) => {
        const rawName = entry.name;
        const name =
          rawName === "lighter" || rawName === "llpApy"
            ? "Lighter"
            : rawName === "hyperliquid" || rawName === "hlpApy"
              ? "Hyperliquid"
              : rawName ?? "—";
        return (
          <p key={i} className="compare-tooltip__row" style={{ color: entry.color }}>
            <span>{name}</span>
            <span className="compare-tooltip__value">
              {entry.value == null ? "—" : `${Number(entry.value).toFixed(2)}%`}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function VenueCard({
  venue,
  name,
  short,
  color,
  snapshot,
  loading,
}: {
  venue: "lighter" | "hyperliquid";
  name: string;
  short: string;
  color: string;
  snapshot: LlpSnapshot | HlpSnapshot | null;
  loading: boolean;
}) {
  const isLlp = venue === "lighter";
  const pool = snapshot;

  return (
    <article
      className={`llp-hlp-venue llp-hlp-venue--${venue}`}
      style={{ "--venue-color": color } as CSSProperties}
    >
      <header className="llp-hlp-venue__head">
        <span className="llp-hlp-venue__badge" style={{ background: color }}>
          {short}
        </span>
        <div>
          <h3 className="llp-hlp-venue__name">{name}</h3>
        </div>
      </header>

      {loading && !pool ? (
        <LoadingState label="Loading pool…" />
      ) : pool ? (
        <div className="llp-hlp-venue__metrics">
          <div className="llp-hlp-metric">
            <span className="llp-hlp-metric__label">TVL</span>
            <span className="llp-hlp-metric__value">{formatUSD(pool.tvl, true)}</span>
          </div>
          <div className="llp-hlp-metric">
            <span className="llp-hlp-metric__label">{isLlp ? "APY" : "APR"}</span>
            <span className="llp-hlp-metric__value">{formatApy(pool.apy)}</span>
          </div>
          {isLlp ? (
            <>
              <div className="llp-hlp-metric">
                <span className="llp-hlp-metric__label">Sharpe</span>
                <span className="llp-hlp-metric__value">{formatSharpe((pool as LlpSnapshot).sharpe)}</span>
              </div>
              <div className="llp-hlp-metric">
                <span className="llp-hlp-metric__label">Price / Share</span>
                <span className="llp-hlp-metric__value">
                  {formatSharePrice((pool as LlpSnapshot).pricePerShare)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="llp-hlp-metric">
                <span className="llp-hlp-metric__label">Depositors</span>
                <span className="llp-hlp-metric__value">{formatNumber((pool as HlpSnapshot).followerCount)}</span>
              </div>
              <div className="llp-hlp-metric">
                <span className="llp-hlp-metric__label">30D PnL</span>
                <span
                  className={`llp-hlp-metric__value ${
                    (pool as HlpSnapshot).monthPnl >= 0 ? "llp-hlp-metric__value--up" : "llp-hlp-metric__value--down"
                  }`}
                >
                  {formatUSD((pool as HlpSnapshot).monthPnl, true)}
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function LlpHlpSection() {
  const [llp, setLlp] = useState<LlpSnapshot | null>(null);
  const [hlp, setHlp] = useState<HlpSnapshot | null>(null);
  const [compareSeries, setCompareSeries] = useState<PoolComparePoint[]>([]);
  const [llpTrailingApy, setLlpTrailingApy] = useState<number | null>(null);
  const [hlpTrailingApy, setHlpTrailingApy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const venuesRef = useRef<HTMLDivElement>(null);
  const tvlChartRef = useRef<HTMLElement>(null);
  const yieldChartRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const assetsRef = useRef<HTMLElement>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await fetchLlpHlpSnapshots();
      setLlp(data.llp);
      setHlp(data.hlp);
      setCompareSeries(data.compareSeries);
      setLlpTrailingApy(data.llpTrailingApy);
      setHlpTrailingApy(data.hlpTrailingApy);
    } catch (err: unknown) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Failed to load pool data";
        toast.error(message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const compareRows = useMemo((): CompareRow[] => {
    if (!llp || !hlp) return [];
    return [
      {
        label: "Total pool value (TVL)",
        lighter: formatUSD(llp.tvl, true),
        hyperliquid: formatUSD(hlp.tvl, true),
        highlight: metricWinner(llp.tvl, hlp.tvl),
      },
      {
        label: "Yield",
        lighter: formatApy(llp.apy),
        hyperliquid: formatApy(hlp.apy),
        highlight: metricWinner(llp.apy, hlp.apy),
      },
      {
        label: "30D trailing",
        lighter: formatApy(llpTrailingApy),
        hyperliquid: formatApy(hlpTrailingApy),
        highlight: metricWinner(llpTrailingApy, hlpTrailingApy),
      },
      {
        label: "Sharpe ratio",
        lighter: formatSharpe(llp.sharpe),
        hyperliquid: "—",
        highlight: llp.sharpe > 0 ? "lighter" : null,
      },
      {
        label: "Price per share",
        lighter: formatSharePrice(llp.pricePerShare),
        hyperliquid: "—",
      },
      {
        label: "Operator / leader fee",
        lighter: `${llp.operatorFee.toFixed(2)}%`,
        hyperliquid: `${(hlp.leaderCommission * 100).toFixed(2)}%`,
        highlight: metricWinner(llp.operatorFee, hlp.leaderCommission * 100, false),
      },
      {
        label: "Total shares",
        lighter: formatNumber(llp.totalShares, true),
        hyperliquid: "—",
      },
      {
        label: "Depositors",
        lighter: "—",
        hyperliquid: formatNumber(hlp.followerCount),
      },
      {
        label: "Perps allocation",
        lighter: formatUSD(llp.perpsValue, true),
        hyperliquid: "—",
      },
      {
        label: "Spot allocation",
        lighter: formatUSD(llp.spotValue, true),
        hyperliquid: "—",
      },
    ];
  }, [llp, hlp, llpTrailingApy, hlpTrailingApy]);

  return (
    <div className="llp-hlp-section">
      <div ref={venuesRef} className="llp-hlp-venues downloadable-block relative">
        <ChartDownloadButton
          targetRef={venuesRef}
          filename={chartDownloadFilename("llp-hlp-overview")}
          className="downloadable-block__dl"
        />
        <VenueCard
          venue="lighter"
          name="Lighter Liquidity Provider"
          short="LLP"
          color={LIGHTER_COLOR}
          snapshot={llp}
          loading={loading}
        />
        <VenueCard
          venue="hyperliquid"
          name="Hyperliquidity Provider"
          short="HLP"
          color={HYPERLIQUID_COLOR}
          snapshot={hlp}
          loading={loading}
        />
      </div>

      {compareSeries.length > 0 && (
        <div className="llp-hlp-charts">
          <article ref={tvlChartRef} className="llp-hlp-chart-card downloadable-block">
            <div className="card-head-dl">
              <h4 className="llp-hlp-chart-card__title card-head-dl__title">TVL</h4>
              <ChartDownloadButton
                targetRef={tvlChartRef}
                filename={chartDownloadFilename("llp-hlp-tvl")}
              />
            </div>
            <CompareLegend />
            <div className="llp-hlp-chart llp-hlp-chart--tall">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compareSeries} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#24263a" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={48}
                  />
                  <YAxis
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v) => formatUSD(Number(v), true)}
                  />
                  <Tooltip content={<CompareTooltip format="currency" />} cursor={CHART_CURSOR} />
                  <Line
                    type="monotone"
                    dataKey="llp"
                    name="lighter"
                    stroke={LIGHTER_COLOR}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="hlp"
                    name="hyperliquid"
                    stroke={HYPERLIQUID_COLOR}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article ref={yieldChartRef} className="llp-hlp-chart-card downloadable-block">
            <div className="card-head-dl">
              <h4 className="llp-hlp-chart-card__title card-head-dl__title">Yield</h4>
              <ChartDownloadButton
                targetRef={yieldChartRef}
                filename={chartDownloadFilename("llp-hlp-yield")}
              />
            </div>
            <CompareLegend />
            <div className="llp-hlp-chart llp-hlp-chart--tall">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compareSeries} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#24263a" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={48}
                  />
                  <YAxis
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                  />
                  <Tooltip content={<ApyCompareTooltip />} cursor={CHART_CURSOR} />
                  <Line
                    type="monotone"
                    dataKey="llpApy"
                    name="lighter"
                    stroke={LIGHTER_COLOR}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="hlpApy"
                    name="hyperliquid"
                    stroke={HYPERLIQUID_COLOR}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      )}

      <div ref={tableRef} className="card w-full min-w-0 downloadable-block relative">
        <ChartDownloadButton
          targetRef={tableRef}
          filename={chartDownloadFilename("llp-hlp-compare")}
          className="downloadable-block__dl"
        />
        {loading && !compareRows.length ? (
          <LoadingState label="Loading comparison…" minHeight={180} />
        ) : (
          <div className="table-scroll">
          <table className="w-full text-sm market-table llp-hlp-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="text-right llp-hlp-table__col--lighter">Lighter LLP</th>
                <th className="text-right llp-hlp-table__col--hyperliquid">Hyperliquid HLP</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td
                    className={`text-right tabular-nums ${
                      row.highlight === "lighter" ? "llp-hlp-table__win" : ""
                    }`}
                  >
                    {row.lighter}
                  </td>
                  <td
                    className={`text-right tabular-nums ${
                      row.highlight === "hyperliquid" ? "llp-hlp-table__win" : ""
                    }`}
                  >
                    {row.hyperliquid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {llp?.assets.length ? (
        <article ref={assetsRef} className="card w-full min-w-0 downloadable-block relative">
          <ChartDownloadButton
            targetRef={assetsRef}
            filename={chartDownloadFilename("llp-assets")}
            className="downloadable-block__dl"
          />
          <header className="llp-hlp-assets-head">
            <h4 className="llp-hlp-assets-head__title">LLP assets</h4>
          </header>
          <div className="table-scroll">
          <table className="w-full text-sm market-table asset-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Margin balance</th>
                <th className="text-right">Locked</th>
              </tr>
            </thead>
            <tbody>
              {llp.assets.map((asset) => (
                <tr key={asset.asset_id}>
                  <td className="font-medium text-[#f4f4f5]">{asset.symbol}</td>
                  <td className="text-right tabular-nums">{formatUSD(parseFloat(asset.balance), true)}</td>
                  <td className="text-right tabular-nums">{formatUSD(parseFloat(asset.margin_balance), true)}</td>
                  <td className="text-right tabular-nums text-[#71717a]">
                    {formatUSD(parseFloat(asset.locked_balance), true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </article>
      ) : null}

    </div>
  );
}