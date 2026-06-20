export interface StatValue {
  lighter: number | null;
  hyperliquid: number | null;
  label: string;
  format: "number" | "currency" | "compact" | "ratio";
}

export interface ValuationMetrics {
  market_cap: StatValue;
  fdv: StatValue;
  pf_mcap: StatValue;
  pf_fdv: StatValue;
  pe_mcap: StatValue;
  pe_fdv: StatValue;
}

export interface ValuationRatioCharts {
  pf_mcap: TimeSeriesPoint[];
  pf_fdv: TimeSeriesPoint[];
  pe_mcap: TimeSeriesPoint[];
  pe_fdv: TimeSeriesPoint[];
}

export interface RatioChartDefinition {
  key: keyof ValuationRatioCharts;
  label: string;
  latest?: StatValue;
}

export interface TimeSeriesPoint {
  timestamp: number;
  lighter: number | null;
  hyperliquid: number | null;
}

export interface LiveComparisonPayload {
  updated_at: string;
  sources: {
    lighter: string[];
    hyperliquid: string[];
  };
  headline: StatValue[];
  valuation?: ValuationMetrics;
  valuation_charts?: ValuationRatioCharts;
  volume_chart: TimeSeriesPoint[];
  notes: string[];
}