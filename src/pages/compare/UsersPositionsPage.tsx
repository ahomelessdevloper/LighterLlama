import {
  CompareLegend,
  ComparePageTitle,
  MetricBarCard,
  useCompareCharts,
} from "../../components/compare/shared";
import { LoadingState } from "../../components/LoadingState";
import { useLiveComparison } from "../../hooks/useLiveComparison";

const USER_METRIC_LABELS = new Set([
  "Total Users",
  "Total Deposits",
  "Total Withdrawals",
  "Total Notional Liquidated",
  "Active Markets",
  "24h Volume",
  "Open Interest",
]);

export default function UsersPositionsPage() {
  const { payload, loading } = useLiveComparison();
  const { barHeight, tickSize } = useCompareCharts(payload);

  const metrics = (payload?.headline ?? []).filter((m) => USER_METRIC_LABELS.has(m.label));

  if (loading && !payload) {
    return <LoadingState variant="page" label="Loading users & positions…" />;
  }

  return (
    <>
      <ComparePageTitle title="Users / Positions" />
      <CompareLegend />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-3">
        {metrics.map((metric) => (
          <MetricBarCard
            key={metric.label}
            metric={metric}
            height={barHeight}
            tickSize={tickSize}
          />
        ))}
      </div>
    </>
  );
}