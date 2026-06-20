import { useEffect, useMemo, useRef, useState } from "react";
import { ChartDownloadButton } from "../ChartDownloadButton";
import { chartDownloadFilename } from "../../lib/chartDownload";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChartDate, formatStatValue, ratioChartDefinitions } from "../../lib/compareFormat";
import type { LiveComparisonPayload, StatValue, TimeSeriesPoint } from "../../types/liveStats";
import { VenueLegendItem, VenueLogo, venueDisplayName } from "../VenueBrand";

export const LIGHTER_COLOR = "#22d3ee";
export const HYPERLIQUID_COLOR = "#4ade80";

export const BAR_CURSOR = { fill: "rgba(34, 211, 238, 0.06)", stroke: "transparent" };
export const CHART_CURSOR = {
  stroke: "#32354a",
  strokeWidth: 1,
  strokeDasharray: "4 4",
  fill: "rgba(34, 211, 238, 0.05)",
};

export function CompareTooltip({
  active,
  payload,
  label,
  format = "number",
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  format?: StatValue["format"];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="compare-tooltip">
      {label && <p className="compare-tooltip__label">{label}</p>}
      {payload.map((entry, i) => {
        const rawName =
          (entry as { payload?: { name?: string } }).payload?.name ?? entry.name;
        const name = venueDisplayName(rawName);
        return (
          <p key={`${rawName}-${i}`} className="compare-tooltip__row" style={{ color: entry.color }}>
            <span>{name}</span>
            <span className="compare-tooltip__value">
              {formatStatValue(entry.value ?? null, format)}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function CompareLegend() {
  return (
    <div className="venue-legend-row mb-3 sm:mb-4">
      <VenueLegendItem venue="lighter" />
      <VenueLegendItem venue="hyperliquid" />
    </div>
  );
}

export function ComparePageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="compare-page-head mb-4 sm:mb-5">
      <h1 className="compare-page-head__title">{title}</h1>
      {subtitle && <p className="compare-page-head__sub">{subtitle}</p>}
    </header>
  );
}

export function ComingSoonPanel({ title }: { title: string }) {
  return (
    <article className="compare-soon card p-6 sm:p-8">
      <h2 className="compare-soon__title">{title}</h2>
    </article>
  );
}

export function useIsMobile(breakpoint = 639) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    update(mq);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

export function availableMetrics(metrics: StatValue[]): StatValue[] {
  return metrics.filter((m) => m.lighter != null || m.hyperliquid != null);
}

function isMobileTickWidth(tickSize: number) {
  return tickSize <= 8 ? 42 : 56;
}

function MetricValues({ metric }: { metric: StatValue }) {
  return (
    <div className="metric-venue-values mb-2">
      <span className="metric-venue-values__side metric-venue-values__side--lighter">
        <VenueLogo venue="lighter" size="xs" />
        <span className="metric-venue-values__name">Lighter</span>
        <span className="metric-venue-values__val">{formatStatValue(metric.lighter, metric.format)}</span>
      </span>
      <span className="metric-venue-values__side metric-venue-values__side--hyperliquid">
        <VenueLogo venue="hyperliquid" size="xs" />
        <span className="metric-venue-values__name">Hyperliquid</span>
        <span className="metric-venue-values__val">{formatStatValue(metric.hyperliquid, metric.format)}</span>
      </span>
    </div>
  );
}

export function MetricBarCard({
  metric,
  height,
  tickSize,
  filename,
}: {
  metric: StatValue;
  height: number;
  tickSize: number;
  filename?: string;
}) {
  const captureRef = useRef<HTMLElement>(null);
  const data = [
    { name: "Lighter", value: metric.lighter ?? 0, fill: LIGHTER_COLOR },
    { name: "Hyperliquid", value: metric.hyperliquid ?? 0, fill: HYPERLIQUID_COLOR },
  ];

  return (
    <article ref={captureRef} className="card p-2.5 sm:p-3 downloadable-block">
      <ChartDownloadButton
        targetRef={captureRef}
        filename={filename ?? chartDownloadFilename(metric.label)}
        className="downloadable-block__dl"
      />
      <h4 className="text-xs sm:text-sm font-normal text-white mb-1 pr-8">{metric.label}</h4>
      <MetricValues metric={metric} />
      <div className="compare-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 2, right: 2, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#24263a" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "#71717a", fontSize: tickSize }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: tickSize }}
              tickLine={false}
              axisLine={false}
              width={isMobileTickWidth(tickSize)}
              tickFormatter={(v) => formatStatValue(Number(v), metric.format)}
            />
            <Tooltip content={<CompareTooltip format={metric.format} />} cursor={BAR_CURSOR} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} activeBar={false}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export function RatioLineCard({
  label,
  series,
  height,
  tickSize,
  filename,
}: {
  label: string;
  series: TimeSeriesPoint[];
  height: number;
  tickSize: number;
  filename?: string;
}) {
  const captureRef = useRef<HTMLElement>(null);
  const chartData = useMemo(
    () =>
      (series ?? []).map((point) => ({
        time: formatChartDate(point.timestamp),
        lighter: point.lighter,
        hyperliquid: point.hyperliquid,
      })),
    [series]
  );

  return (
    <article ref={captureRef} className="card p-2.5 sm:p-3 downloadable-block">
      <ChartDownloadButton
        targetRef={captureRef}
        filename={filename ?? chartDownloadFilename(label)}
        className="downloadable-block__dl"
      />
      <h4 className="text-xs sm:text-sm font-normal text-white mb-2 pr-8">{label}</h4>
      <div className="compare-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 2, right: 2, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#24263a" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#71717a", fontSize: tickSize }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: tickSize }}
              tickLine={false}
              axisLine={false}
              width={isMobileTickWidth(tickSize)}
              tickFormatter={(v) => `${Number(v).toFixed(1)}x`}
            />
            <Tooltip content={<CompareTooltip format="ratio" />} cursor={CHART_CURSOR} />
            <Line
              type="monotone"
              dataKey="lighter"
              name="lighter"
              stroke={LIGHTER_COLOR}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="hyperliquid"
              name="hyperliquid"
              stroke={HYPERLIQUID_COLOR}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export function FeesAreaChart({
  payload,
  height,
  tickSize,
}: {
  payload: LiveComparisonPayload;
  height: number;
  tickSize: number;
}) {
  const feesChartData = useMemo(
    () =>
      payload.volume_chart.map((point) => ({
        time: formatChartDate(point.timestamp),
        lighter: point.lighter,
        hyperliquid: point.hyperliquid,
      })),
    [payload]
  );

  return (
    <article className="card p-2.5 sm:p-3">
      <div className="compare-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={feesChartData} margin={{ top: 2, right: 4, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="lighterFees" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LIGHTER_COLOR} stopOpacity={0.4} />
                <stop offset="100%" stopColor={LIGHTER_COLOR} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="hyperFees" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HYPERLIQUID_COLOR} stopOpacity={0.4} />
                <stop offset="100%" stopColor={HYPERLIQUID_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 2" stroke="#24263a" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#71717a", fontSize: tickSize }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: tickSize }}
              tickLine={false}
              axisLine={false}
              width={isMobileTickWidth(tickSize)}
              tickFormatter={(v) => formatStatValue(Number(v), "currency")}
            />
            <Tooltip content={<CompareTooltip format="currency" />} cursor={CHART_CURSOR} />
            <Area
              type="monotone"
              dataKey="lighter"
              name="lighter"
              stroke={LIGHTER_COLOR}
              fill="url(#lighterFees)"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="hyperliquid"
              name="hyperliquid"
              stroke={HYPERLIQUID_COLOR}
              fill="url(#hyperFees)"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export function useCompareCharts(payload: LiveComparisonPayload | null) {
  const isMobile = useIsMobile();
  const barHeight = isMobile ? 130 : 160;
  const lineHeight = isMobile ? 170 : 200;
  const areaHeight = isMobile ? 200 : 240;
  const tickSize = isMobile ? 8 : 10;

  const headline = useMemo(
    () => (payload ? availableMetrics(payload.headline) : []),
    [payload]
  );

  const valuationBars = useMemo(() => {
    if (!payload?.valuation) return [];
    return availableMetrics([payload.valuation.market_cap, payload.valuation.fdv]);
  }, [payload]);

  const ratioCharts = useMemo(() => ratioChartDefinitions(payload?.valuation), [payload]);

  return { barHeight, lineHeight, areaHeight, tickSize, headline, valuationBars, ratioCharts };
}