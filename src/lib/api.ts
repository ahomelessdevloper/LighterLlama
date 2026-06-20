import type {
  ExchangeStats,
  ExchangeMetric,
  ExchangeMetricsResponse,
  Period,
  MetricKind,
  FlowMetricKind,
} from '../types';

// Always use same-origin proxy path (Vite dev proxy + Netlify _redirects in production).
const API_BASE = '/lighter-api';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function getExchangeStats(): Promise<ExchangeStats> {
  return fetchJson<ExchangeStats>('/exchangeStats');
}

export async function getExchangeMetrics(
  period: Period,
  kind: MetricKind,
  market?: string
): Promise<ExchangeMetricsResponse> {
  const params = new URLSearchParams({ period, kind });
  if (market) {
    params.set('filter', 'byMarket');
    params.set('value', market);
  }
  return fetchJson<ExchangeMetricsResponse>(`/exchangeMetrics?${params.toString()}`);
}

export async function getFlowMetrics(
  period: Period,
  kind: FlowMetricKind
): Promise<ExchangeMetricsResponse> {
  const params = new URLSearchParams({ period, kind });
  return fetchJson<ExchangeMetricsResponse>(`/exchangeMetrics?${params.toString()}`);
}

export function sumMetricData(metrics: ExchangeMetric[]): number {
  return metrics.reduce((sum, row) => sum + (row.data || 0), 0);
}

// Helper to format large numbers for display
export function formatVolume(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toFixed(0);
}

export function formatUSD(value: number, compact = true): string {
  if (compact) {
    return '$' + formatVolume(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(0);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(5);
}

export function formatChange(change: number): string {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export function formatNumber(n: number, compact = true): string {
  if (!compact) return n.toLocaleString();
  return formatVolume(n);
}
