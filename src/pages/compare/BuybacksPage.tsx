import { useEffect, useState } from "react";
import {
  CompareLegend,
  ComparePageTitle,
  MetricBarCard,
  useCompareCharts,
} from "../../components/compare/shared";
import { LoadingState } from "../../components/LoadingState";
import type { StatValue } from "../../types/liveStats";

interface MetricRow {
  timestamp: number;
  data: number;
}

async function fetchBuybackUsd(period: string): Promise<number | null> {
  const res = await fetch(`/lighter-api/exchangeMetrics?kind=buyback_usdc&period=${period}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { metrics?: MetricRow[] };
  const rows = json.metrics ?? [];
  if (!rows.length) return null;
  if (period === "d") return rows[rows.length - 1]?.data ?? null;
  return rows.reduce((sum, row) => sum + row.data, 0);
}

export default function BuybacksPage() {
  const { tickSize, barHeight } = useCompareCharts(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<StatValue[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, w, m, all] = await Promise.all([
        fetchBuybackUsd("d"),
        fetchBuybackUsd("w"),
        fetchBuybackUsd("m"),
        fetchBuybackUsd("all"),
      ]);
      if (cancelled) return;
      setMetrics([
        { label: "24h Buybacks", lighter: d, hyperliquid: null, format: "currency" },
        { label: "7d Buybacks", lighter: w, hyperliquid: null, format: "currency" },
        { label: "30d Buybacks", lighter: m, hyperliquid: null, format: "currency" },
        { label: "All-time Buybacks", lighter: all, hyperliquid: null, format: "currency" },
      ]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingState variant="page" label="Loading buybacks…" />;
  }

  return (
    <>
      <ComparePageTitle title="Buybacks" />
      <CompareLegend />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-4">
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