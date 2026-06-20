import {
  CompareLegend,
  ComparePageTitle,
  MetricBarCard,
  RatioLineCard,
  useCompareCharts,
} from "../../components/compare/shared";
import { LoadingState } from "../../components/LoadingState";
import { useLiveComparison } from "../../hooks/useLiveComparison";

export default function PePage() {
  const { payload, loading } = useLiveComparison();
  const { barHeight, lineHeight, tickSize, valuationBars, ratioCharts } = useCompareCharts(payload);

  if (loading && !payload) {
    return <LoadingState variant="page" label="Loading P/E data…" />;
  }

  if (!payload?.valuation) {
    return (
      <ComparePageTitle title="P/E" />
    );
  }

  return (
    <>
      <ComparePageTitle title="P/E" />
      <CompareLegend />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
        {valuationBars.map((metric) => (
          <MetricBarCard
            key={metric.label}
            metric={metric}
            height={barHeight}
            tickSize={tickSize}
          />
        ))}
      </div>
      {payload.valuation_charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-3">
          {ratioCharts.map((definition) => (
            <RatioLineCard
              key={definition.key}
              label={definition.label}
              series={payload.valuation_charts![definition.key]}
              height={lineHeight}
              tickSize={tickSize}
            />
          ))}
        </div>
      )}
    </>
  );
}