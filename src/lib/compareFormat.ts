import type { StatValue, ValuationMetrics, ValuationRatioCharts } from "../types/liveStats";
import { formatNumber, formatUSD } from "./api";

export function formatStatValue(
  value: number | null,
  format: StatValue["format"]
): string {
  if (value == null) return "—";
  if (format === "ratio") return `${value.toFixed(2)}x`;
  if (format === "currency") return formatUSD(value, true);
  if (format === "compact" || format === "number") return formatNumber(value, true);
  return String(value);
}

export function formatChartDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ratioChartDefinitions(
  valuation?: ValuationMetrics
): Array<{ key: keyof ValuationRatioCharts; label: string; latest?: StatValue }> {
  if (!valuation) return [];
  return [
    { key: "pf_mcap", label: "PF (Market Cap)", latest: valuation.pf_mcap },
    { key: "pf_fdv", label: "PF (FDV)", latest: valuation.pf_fdv },
    { key: "pe_mcap", label: "PE (Market Cap)", latest: valuation.pe_mcap },
    { key: "pe_fdv", label: "PE (FDV)", latest: valuation.pe_fdv },
  ];
}