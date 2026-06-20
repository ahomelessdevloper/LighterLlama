import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, fromUnixTime } from "date-fns";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { ChartDownloadButton } from "./ChartDownloadButton";
import { LoadingState } from "./LoadingState";
import { chartDownloadFilename } from "../lib/chartDownload";
import { formatUSD, getFlowMetrics, sumMetricData } from "../lib/api";
import type { ExchangeMetric, Period } from "../types";
import { FLOW_PERIODS } from "../types";

const REFRESH_MS = 28_000;

const INFLOW_COLORS = ["#06b6d4", "#22d3ee", "#67e8f9", "#4ade80", "#34d399", "#2dd4bf", "#5eead4"];
const OUTFLOW_COLORS = ["#f59e0b", "#fbbf24", "#fb923c", "#fb7185", "#f97316", "#fdba74", "#fda4af"];

type FlowSegment = {
  id: string;
  label: string;
  value: number;
  color: string;
  pct: number;
};

function buildDailySegments(
  metrics: ExchangeMetric[],
  prefix: string,
  palette: string[]
): FlowSegment[] {
  const sorted = [...metrics].sort((a, b) => a.timestamp - b.timestamp);
  const total = sumMetricData(sorted) || 1;
  return sorted.map((row, index) => ({
    id: `${prefix}-${row.timestamp}`,
    label: format(fromUnixTime(row.timestamp), "MMM d"),
    value: row.data,
    color: palette[index % palette.length],
    pct: (row.data / total) * 100,
  }));
}

function FlowTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: FlowSegment }>;
}) {
  if (!active || !payload?.length) return null;
  const segment = payload[0]?.payload;
  if (!segment) return null;
  return (
    <div className="flow-tooltip">
      <p className="flow-tooltip__label">{segment.label}</p>
      <p className="flow-tooltip__row" style={{ color: segment.color }}>
        <span>Amount</span>
        <span className="flow-tooltip__value">{formatUSD(segment.value, true)}</span>
      </p>
      <p className="flow-tooltip__row" style={{ color: segment.color }}>
        <span>Share</span>
        <span className="flow-tooltip__value">{segment.pct.toFixed(1)}%</span>
      </p>
    </div>
  );
}

function FlowDonut({
  title,
  subtitle,
  segments,
  centerValue,
  centerLabel,
  accent,
}: {
  title: string;
  subtitle?: string;
  segments: FlowSegment[];
  centerValue: string;
  centerLabel: string;
  accent: "inflow" | "outflow" | "mix";
}) {
  if (!segments.length) {
    return (
      <article className={`flow-donut-card flow-donut-card--${accent}`}>
        <header className="flow-donut-card__head">
          <h4 className="flow-donut-card__title">{title}</h4>
          {subtitle && <p className="flow-donut-card__sub">{subtitle}</p>}
        </header>
        <div className="flow-donut-card__empty">No data</div>
      </article>
    );
  }

  return (
    <article className={`flow-donut-card flow-donut-card--${accent}`}>
      <header className="flow-donut-card__head">
        <h4 className="flow-donut-card__title">{title}</h4>
        {subtitle && <p className="flow-donut-card__sub">{subtitle}</p>}
      </header>
      <div className="flow-donut-card__chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={segments.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {segments.map((segment) => (
                <Cell key={segment.id} fill={segment.color} />
              ))}
            </Pie>
            <Tooltip content={<FlowTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flow-donut-card__center">
          <span className="flow-donut-card__center-value">{centerValue}</span>
          <span className="flow-donut-card__center-label">{centerLabel}</span>
        </div>
      </div>
      <ul className="flow-donut-card__legend">
        {segments.map((segment) => (
          <li key={segment.id} className="flow-donut-card__legend-item">
            <span className="flow-donut-card__legend-dot" style={{ background: segment.color }} />
            <span className="flow-donut-card__legend-label">{segment.label}</span>
            <span className="flow-donut-card__legend-value">{formatUSD(segment.value, true)}</span>
            <span className="flow-donut-card__legend-pct">{segment.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

interface InflowOutflowSectionProps {
  embedded?: boolean;
}

export function InflowOutflowSection({ embedded = false }: InflowOutflowSectionProps) {
  const [period, setPeriod] = useState<Period>("w");
  const [inflowMetrics, setInflowMetrics] = useState<ExchangeMetric[]>([]);
  const [outflowMetrics, setOutflowMetrics] = useState<ExchangeMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const exportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [inflowRes, outflowRes] = await Promise.all([
        getFlowMetrics(period, "inflow"),
        getFlowMetrics(period, "outflow"),
      ]);
      setInflowMetrics(inflowRes.metrics ?? []);
      setOutflowMetrics(outflowRes.metrics ?? []);
    } catch (err: unknown) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Failed to load flow metrics";
        toast.error(message);
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

  const totals = useMemo(() => {
    const inflow = sumMetricData(inflowMetrics);
    const outflow = sumMetricData(outflowMetrics);
    const total = inflow + outflow || 1;
    const net = inflow - outflow;
    return { inflow, outflow, net, total };
  }, [inflowMetrics, outflowMetrics]);

  const mixSegments = useMemo((): FlowSegment[] => {
    const { inflow, outflow, total } = totals;
    if (inflow <= 0 && outflow <= 0) return [];
    return [
      {
        id: "inflow",
        label: "Inflow",
        value: inflow,
        color: "#22d3ee",
        pct: (inflow / total) * 100,
      },
      {
        id: "outflow",
        label: "Outflow",
        value: outflow,
        color: "#fbbf24",
        pct: (outflow / total) * 100,
      },
    ];
  }, [totals]);

  const inflowSegments = useMemo(
    () => buildDailySegments(inflowMetrics, "in", INFLOW_COLORS),
    [inflowMetrics]
  );

  const outflowSegments = useMemo(
    () => buildDailySegments(outflowMetrics, "out", OUTFLOW_COLORS),
    [outflowMetrics]
  );

  const periodLabel = FLOW_PERIODS.find((p) => p.value === period)?.label ?? period;
  const netPositive = totals.net >= 0;

  return (
    <div className={`flow-section w-full ${embedded ? "flow-section--embedded" : ""}`}>
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${embedded ? "mb-2" : "mb-2.5"}`}>
        {!embedded && (
          <div>
            <h2 className="section-title !mb-0">Capital Flow</h2>
            <p className="flow-section__sub">Inflow vs outflow from exchange metrics</p>
          </div>
        )}
        {embedded && (
          <p className="flow-section__sub !m-0">Inflow vs outflow · select period</p>
        )}
        <div className="flex gap-1 flex-wrap sm:ml-auto">
          {FLOW_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`btn btn-sm text-xs ${period === p.value ? "btn-active" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={exportRef} className="downloadable-block relative">
        <ChartDownloadButton
          targetRef={exportRef}
          filename={chartDownloadFilename(`capital-flow-${period}`)}
          className="downloadable-block__dl downloadable-block__dl--flush"
        />

        {loading && !inflowMetrics.length && !outflowMetrics.length ? (
          <div className="card">
            <LoadingState label="Loading capital flow…" minHeight={280} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-2.5 sm:mb-3">
              <div className="stat-card stat-card--cyan">
                <div className="stat-card__label">Total Inflow</div>
                <div className="stat-card__value">{formatUSD(totals.inflow, true)}</div>
                <div className="stat-card__sub">{periodLabel}</div>
              </div>
              <div className="stat-card stat-card--amber">
                <div className="stat-card__label">Total Outflow</div>
                <div className="stat-card__value">{formatUSD(totals.outflow, true)}</div>
                <div className="stat-card__sub">{periodLabel}</div>
              </div>
              <div className={`stat-card ${netPositive ? "stat-card--emerald" : "stat-card--violet"}`}>
                <div className="stat-card__label">Net Flow</div>
                <div className="stat-card__value">
                  {netPositive ? "+" : "−"}
                  {formatUSD(Math.abs(totals.net), true)}
                </div>
                <div className="stat-card__sub">{netPositive ? "Net inflow" : "Net outflow"}</div>
              </div>
              <div className="stat-card stat-card--violet">
                <div className="stat-card__label">Inflow Share</div>
                <div className="stat-card__value">
                  {mixSegments.length ? `${mixSegments[0].pct.toFixed(1)}%` : "—"}
                </div>
                <div className="stat-card__sub">of total flow</div>
              </div>
            </div>

            <div className="flow-donuts-grid">
              <FlowDonut
                title="Flow mix"
                subtitle={`${periodLabel} · inflow vs outflow`}
                segments={mixSegments}
                centerValue={mixSegments.length ? `${mixSegments[0].pct.toFixed(0)}%` : "—"}
                centerLabel="inflow"
                accent="mix"
              />
              <FlowDonut
                title="Inflow"
                subtitle={`${periodLabel} · daily breakdown`}
                segments={inflowSegments}
                centerValue={formatUSD(totals.inflow, true)}
                centerLabel="total"
                accent="inflow"
              />
              <FlowDonut
                title="Outflow"
                subtitle={`${periodLabel} · daily breakdown`}
                segments={outflowSegments}
                centerValue={formatUSD(totals.outflow, true)}
                centerLabel="total"
                accent="outflow"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}