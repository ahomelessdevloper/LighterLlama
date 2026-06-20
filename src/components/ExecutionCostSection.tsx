import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "./LoadingState";
import { ChartDownloadButton } from "./ChartDownloadButton";
import { chartDownloadFilename } from "../lib/chartDownload";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  buildAllInHistory,
  EXECUTE_STATS_PERIODS,
  EXECUTE_TRADE_SIZES,
  EXECUTE_VENUES,
  fetchExecuteStats,
  formatFeeUsd,
  formatSlippageBps,
  formatTradeSize,
  getCompareMarkets,
  getExecuteMarketCategory,
  getVenueCostMatrix,
  cheapestVenue,
  type ExecuteStatPoint,
  type ExecuteStatsPeriod,
  type ExecuteTradeSize,
  type ExecuteVenue,
  type VenueCostCell,
} from "../lib/executeStats";

const REFRESH_MS = 60_000;

const DEFAULT_FEES: Record<ExecuteVenue, string> = Object.fromEntries(
  EXECUTE_VENUES.map((v) => [v.id, String(v.defaultFeeBps)])
) as Record<ExecuteVenue, string>;

function parseFeeBps(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function FeeUsdCell({
  value,
  isWinner,
}: {
  value: number;
  isWinner?: boolean;
}) {
  return (
    <span className={`exec-cost-fee ${isWinner ? "exec-cost-fee--win" : ""}`}>
      {formatFeeUsd(value)}
    </span>
  );
}

export function ExecutionCostSection() {
  const [period, setPeriod] = useState<ExecuteStatsPeriod>("m");
  const [points, setPoints] = useState<ExecuteStatPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState("BTC");
  const [chartSize, setChartSize] = useState<ExecuteTradeSize>(10_000);
  const [feeInputs, setFeeInputs] = useState<Record<ExecuteVenue, string>>(DEFAULT_FEES);

  const feeBpsByVenue = useMemo(() => {
    return Object.fromEntries(
      EXECUTE_VENUES.map((v) => [v.id, parseFeeBps(feeInputs[v.id], v.defaultFeeBps)])
    ) as Record<ExecuteVenue, number>;
  }, [feeInputs]);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await fetchExecuteStats(period);
      setPoints(data.result ?? []);
    } catch (err: unknown) {
      if (!silent) {
        toast.error("Execution stats failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const markets = useMemo(() => getCompareMarkets(points), [points]);

  const marketsByCategory = useMemo(
    () => ({
      crypto: markets.filter((m) => getExecuteMarketCategory(m) === "crypto"),
      rwa: markets.filter((m) => getExecuteMarketCategory(m) === "rwa"),
    }),
    [markets]
  );

  useEffect(() => {
    if (!markets.length) return;
    if (!markets.includes(market)) {
      setMarket(markets.includes("BTC") ? "BTC" : markets[0]);
    }
  }, [markets, market]);

  const costMatrix = useMemo(
    () => getVenueCostMatrix(points, market, feeBpsByVenue),
    [points, market, feeBpsByVenue]
  );

  const feeBarRows = useMemo(
    () =>
      EXECUTE_TRADE_SIZES.map((size) => {
        const row: Record<string, string | number> = { size: formatTradeSize(size) };
        for (const venue of EXECUTE_VENUES) {
          row[venue.id] = costMatrix[size][venue.id].feeUsd;
        }
        return row;
      }),
    [costMatrix]
  );

  const allInBarRows = useMemo(
    () =>
      EXECUTE_TRADE_SIZES.map((size) => {
        const row: Record<string, string | number | null> = { size: formatTradeSize(size) };
        for (const venue of EXECUTE_VENUES) {
          row[venue.id] = costMatrix[size][venue.id].allInUsd;
        }
        return row;
      }),
    [costMatrix]
  );

  const history = useMemo(() => {
    const tsSet = new Set<number>();
    const series = EXECUTE_VENUES.map((venue) => ({
      venue,
      points: buildAllInHistory(points, venue.id, market, chartSize, feeBpsByVenue[venue.id]),
    }));
    for (const s of series) {
      for (const p of s.points) tsSet.add(p.ts);
    }
    return [...tsSet].sort((a, b) => a - b).map((ts) => {
      const entry: Record<string, string | number | null> = {
        ts,
        label:
          series
            .map((s) => s.points.find((p) => p.ts === ts)?.label)
            .find(Boolean) ?? "",
      };
      for (const s of series) {
        entry[s.venue.id] = s.points.find((p) => p.ts === ts)?.allInBps ?? null;
      }
      return entry;
    });
  }, [points, market, chartSize, feeBpsByVenue]);

  const maxFeeBar = useMemo(
    () =>
      Math.max(
        ...feeBarRows.flatMap((r) => EXECUTE_VENUES.map((v) => Number(r[v.id]) || 0)),
        1
      ) * 1.12,
    [feeBarRows]
  );

  const maxAllInBar = useMemo(
    () =>
      Math.max(
        ...allInBarRows.flatMap((r) =>
          EXECUTE_VENUES.map((v) => (r[v.id] == null ? 0 : Number(r[v.id])))
        ),
        1
      ) * 1.12,
    [allInBarRows]
  );

  const periodLabel = EXECUTE_STATS_PERIODS.find((p) => p.value === period)?.label ?? period;
  const feesTableRef = useRef<HTMLDivElement>(null);
  const allInTableRef = useRef<HTMLDivElement>(null);
  const feeChartRef = useRef<HTMLElement>(null);
  const allInChartRef = useRef<HTMLElement>(null);
  const historyChartRef = useRef<HTMLElement>(null);

  return (
    <section className="exec-cost-section">
      <div className="exec-cost-panel exec-cost-panel--controls">
        <div className="exec-cost-control">
          <span className="exec-cost-control__label">Period</span>
          <div className="exec-cost-pills">
            {EXECUTE_STATS_PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`exec-cost-pill ${period === p.value ? "exec-cost-pill--active" : ""}`}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="exec-cost-control">
          <label htmlFor="exec-cost-market" className="exec-cost-control__label">
            Market
          </label>
          <select
            id="exec-cost-market"
            className="exec-cost-select"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
          >
            {(["crypto", "rwa"] as const).map((cat) => {
              const list = marketsByCategory[cat];
              if (!list.length) return null;
              return (
                <optgroup key={cat} label={cat.toUpperCase()}>
                  {list.map((sym) => (
                    <option key={sym} value={sym}>
                      {sym}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className="exec-cost-control">
          <span className="exec-cost-control__label">Chart size</span>
          <div className="exec-cost-pills">
            {EXECUTE_TRADE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`exec-cost-pill ${chartSize === size ? "exec-cost-pill--active" : ""}`}
                onClick={() => setChartSize(size)}
              >
                {formatTradeSize(size)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="exec-cost-panel exec-cost-panel--fees">
        <h3 className="exec-cost-panel__title">Taker fees (bps)</h3>
        <div className="exec-cost-fee-inputs">
          {EXECUTE_VENUES.map((venue) => (
            <label
              key={venue.id}
              className={`exec-cost-fee-input exec-cost-fee-input--${venue.id}`}
            >
              <span>{venue.label}</span>
              <input
                value={feeInputs[venue.id]}
                onChange={(e) =>
                  setFeeInputs((prev) => ({ ...prev, [venue.id]: e.target.value }))
                }
              />
              <em>bps</em>
            </label>
          ))}
        </div>
      </div>

      {loading && !points.length ? (
        <div className="exec-cost-panel exec-cost-loading">
          <LoadingState label="Loading execution costs…" minHeight={240} />
        </div>
      ) : (
        <>
          <div ref={feesTableRef} className="exec-cost-panel downloadable-block">
            <div className="card-head-dl">
              <h3 className="exec-cost-panel__title card-head-dl__title">{market} · fees</h3>
              <ChartDownloadButton
                targetRef={feesTableRef}
                filename={chartDownloadFilename(`exec-fees-${market}-${period}`)}
              />
            </div>
            <div className="table-scroll">
              <table className="w-full text-sm market-table exec-cost-table exec-cost-table--venues">
                <thead>
                  <tr>
                    <th>Venue</th>
                    <th className="text-right">Fee (bps)</th>
                    {EXECUTE_TRADE_SIZES.map((size) => (
                      <th key={size} className="text-right">
                        {formatTradeSize(size)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EXECUTE_VENUES.map((venue) => (
                    <tr key={venue.id}>
                      <td>
                        <span className="exec-cost-venue" style={{ color: venue.color }}>
                          <i className="exec-cost-venue__dot shrink-0" style={{ background: venue.color }} />
                          <span className="exec-cost-venue__label">{venue.label}</span>
                        </span>
                      </td>
                      <td className="text-right font-mono tabular-nums text-[#94a3b8]">
                        {feeBpsByVenue[venue.id].toFixed(1)}
                      </td>
                      {EXECUTE_TRADE_SIZES.map((size) => {
                        const cell = costMatrix[size][venue.id];
                        const winner = cheapestVenue(costMatrix[size], "feeUsd");
                        return (
                          <td key={size} className="text-right">
                            <FeeUsdCell
                              value={cell.feeUsd}
                              isWinner={winner === venue.id}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div ref={allInTableRef} className="exec-cost-panel downloadable-block">
            <div className="card-head-dl">
              <h3 className="exec-cost-panel__title card-head-dl__title">{market} · all-in</h3>
              <ChartDownloadButton
                targetRef={allInTableRef}
                filename={chartDownloadFilename(`exec-allin-${market}-${period}`)}
              />
            </div>
            <div className="table-scroll">
              <table className="w-full text-sm market-table exec-cost-table exec-cost-table--venues">
                <thead>
                  <tr>
                    <th>Venue</th>
                    {EXECUTE_TRADE_SIZES.map((size) => (
                      <th key={size} className="text-right">
                        {formatTradeSize(size)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EXECUTE_VENUES.map((venue) => (
                    <tr key={venue.id}>
                      <td>
                        <span className="exec-cost-venue" style={{ color: venue.color }}>
                          <i className="exec-cost-venue__dot shrink-0" style={{ background: venue.color }} />
                          <span className="exec-cost-venue__label">{venue.label}</span>
                        </span>
                      </td>
                      {EXECUTE_TRADE_SIZES.map((size) => {
                        const cell = costMatrix[size][venue.id];
                        const winner = cheapestVenue(costMatrix[size], "allInUsd");
                        return (
                          <td key={size} className="text-right">
                            <AllInCell cell={cell} isWinner={winner === venue.id} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="exec-cost-charts">
            <article ref={feeChartRef} className="exec-cost-chart-card downloadable-block">
              <div className="card-head-dl">
                <h3 className="exec-cost-panel__title card-head-dl__title">{market} · fees by size</h3>
                <ChartDownloadButton
                  targetRef={feeChartRef}
                  filename={chartDownloadFilename(`exec-fees-chart-${market}`)}
                />
              </div>
              <VenueLegend />
              <div className="exec-cost-chart compare-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={feeBarRows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 8" stroke="rgba(51, 65, 85, 0.45)" vertical={false} />
                    <XAxis
                      dataKey="size"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(71, 85, 105, 0.5)" }}
                    />
                    <YAxis
                      domain={[0, maxFeeBar]}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatFeeUsd(Number(v))}
                    />
                    <Tooltip content={<UsdTooltip />} />
                    {EXECUTE_VENUES.map((venue) => (
                      <Bar
                        key={venue.id}
                        dataKey={venue.id}
                        name={venue.label}
                        fill={venue.color}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={14}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article ref={allInChartRef} className="exec-cost-chart-card downloadable-block">
              <div className="card-head-dl">
                <h3 className="exec-cost-panel__title card-head-dl__title">{market} · all-in by size</h3>
                <ChartDownloadButton
                  targetRef={allInChartRef}
                  filename={chartDownloadFilename(`exec-allin-chart-${market}`)}
                />
              </div>
              <VenueLegend />
              <div className="exec-cost-chart compare-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allInBarRows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 8" stroke="rgba(51, 65, 85, 0.45)" vertical={false} />
                    <XAxis
                      dataKey="size"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(71, 85, 105, 0.5)" }}
                    />
                    <YAxis
                      domain={[0, maxAllInBar]}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatFeeUsd(Number(v))}
                    />
                    <Tooltip content={<UsdTooltip />} />
                    {EXECUTE_VENUES.map((venue) => (
                      <Bar
                        key={venue.id}
                        dataKey={venue.id}
                        name={venue.label}
                        fill={venue.color}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={14}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article ref={historyChartRef} className="exec-cost-chart-card exec-cost-chart-card--wide downloadable-block">
              <div className="card-head-dl">
                <h3 className="exec-cost-panel__title card-head-dl__title">
                  {market} · {formatTradeSize(chartSize)} · {periodLabel}
                </h3>
                <ChartDownloadButton
                  targetRef={historyChartRef}
                  filename={chartDownloadFilename(`exec-history-${market}-${chartSize}`)}
                />
              </div>
              <VenueLegend />
              <div className="exec-cost-chart compare-chart">
                {history.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 8" stroke="rgba(51, 65, 85, 0.45)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: "rgba(71, 85, 105, 0.5)" }}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Number(v).toFixed(1)} bps`}
                      />
                      <Tooltip content={<BpsTooltip />} />
                      {EXECUTE_VENUES.map((venue) => (
                        <Line
                          key={venue.id}
                          type="monotone"
                          dataKey={venue.id}
                          name={venue.label}
                          stroke={venue.color}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="exec-cost-chart-empty">No history</div>
                )}
              </div>
            </article>
          </div>
        </>
      )}

    </section>
  );
}

function AllInCell({ cell, isWinner }: { cell: VenueCostCell; isWinner?: boolean }) {
  if (cell.allInUsd == null) {
    return <span className="exec-cost-fee exec-cost-fee--na">—</span>;
  }
  return (
    <div className={`exec-cost-allin ${isWinner ? "exec-cost-allin--win" : ""}`}>
      <span className="exec-cost-allin__usd">{formatFeeUsd(cell.allInUsd)}</span>
      <span className="exec-cost-allin__bps">{formatSlippageBps(cell.allInBps)}</span>
    </div>
  );
}

function VenueLegend() {
  return (
    <div className="exec-cost-legend">
      {EXECUTE_VENUES.map((v) => (
        <span key={v.id}>
          <i style={{ background: v.color }} />
          {v.label}
        </span>
      ))}
    </div>
  );
}

function UsdTooltip({
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
      {payload.map((entry, i) => (
        <p key={i} className="compare-tooltip__row" style={{ color: entry.color as string }}>
          <span>{entry.name}</span>
          <span className="compare-tooltip__value">
            {entry.value == null ? "—" : formatFeeUsd(Number(entry.value), false)}
          </span>
        </p>
      ))}
    </div>
  );
}

function BpsTooltip({
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
      {payload.map((entry, i) => (
        <p key={i} className="compare-tooltip__row" style={{ color: entry.color as string }}>
          <span>{entry.name}</span>
          <span className="compare-tooltip__value">
            {formatSlippageBps(Number(entry.value))}
          </span>
        </p>
      ))}
    </div>
  );
}