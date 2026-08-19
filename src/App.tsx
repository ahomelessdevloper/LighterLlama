import { useState, useEffect, useMemo } from 'react';
import { 
  Search, X,
  ArrowUpDown, ChevronRight, ChevronDown, ChevronUp,
  BarChart3, Activity, Layers, Flame,
} from 'lucide-react';
import { TableScrollZone } from './components/TableScrollZone';
import { SiteNav, type SiteView } from './components/SiteNav';
import CompareHub from './pages/CompareHub';
import DataPage from './pages/DataPage';
import SupportPage from './pages/SupportPage';

import { getSiteViewFromHash, normalizeSupportHash, siteViewHash } from './lib/siteNav';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, BarChart, Bar 
} from 'recharts';
import { format, fromUnixTime } from 'date-fns';
import { toast } from 'sonner';
import { LoadingState } from './components/LoadingState';
import { InflowOutflowSection } from './components/InflowOutflowSection';
import { DashboardTooltip } from './components/charts/DashboardTooltip';
import { useIsMobile } from './hooks/useIsMobile';

import type { ExchangeStats, OrderBookStat, ExchangeMetric, Period, MetricKind, DashboardMetricKind } from './types';
import {
  getExchangeStats,
  getExchangeMetrics,
  getFlowMetrics,
  sumMetricData,
  formatUSD,
  formatPrice,
  formatChange,
  formatNumber,
} from './lib/api';
import {
  METRIC_KINDS,
  METRIC_PERIOD_SUPPORT,
  defaultPeriodForMetric,
  isPeriodSupportedForMetric,
  periodsForMetric,
} from './types';

interface ChartPoint {
  time: string;
  value: number;
  ts: number;
}

function sortMetrics(metrics: ExchangeMetric[]): ExchangeMetric[] {
  return [...metrics].sort((a, b) => a.timestamp - b.timestamp);
}

function formatChartAxisLabel(ts: number, period: Period): string {
  const date = fromUnixTime(ts);
  if (period === 'h' || period === 'd') return format(date, 'HH:mm');
  if (period === 'all' || period === 'y') return format(date, 'MMM dd, yy');
  return format(date, 'MMM dd');
}

function formatChartTooltipLabel(ts: number): string {
  return format(fromUnixTime(ts), 'MMM dd, yyyy');
}

const EQUITY_SYMBOLS = new Set([
  'AAPL','AMD','AMZN','ASML','BABA','COIN','CRCL','DELL','GOOGL','HOOD','IBM','INTC','META','MRVL','MSFT','MSTR','MU','NVDA','ORCL','PLTR','TSLA','TSM','TTWO'
]);
const RWA_SYMBOLS = new Set([
  'AUDUSD','BRENTOIL','EURUSD','GBPUSD','HYUNDAI','HYUNDAIUSD','IWM','MAGS','NATGAS','NZDUSD','QQQ','SAMSUNG','SAMSUNGUSD','SOXX','SPX','SPY','US100','US500','USDCAD','USDCHF','USDJPY','USDKRW','URA','WHEAT','XAG','XAU','XCU','XPD','XPT','BOTZ','EWY','PAXG','STABLE'
]);
const getCategory = (symbol: string): 'crypto' | 'equity' | 'rwa' => {
  if (EQUITY_SYMBOLS.has(symbol)) return 'equity';
  if (RWA_SYMBOLS.has(symbol)) return 'rwa';
  if (/^[A-Z]{3}USD$/.test(symbol)) return 'rwa';
  return 'crypto';
};

function App() {
  const [view, setView] = useState<SiteView>(() => {
    normalizeSupportHash();
    return getSiteViewFromHash();
  });

  useEffect(() => {
    normalizeSupportHash();
    const onHashChange = () => {
      normalizeSupportHash();
      setView(getSiteViewFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next: SiteView) => {
    setView(next);
    window.location.hash = siteViewHash(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [stats, setStats] = useState<ExchangeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const REFRESH_MS = 28000;

 
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'change' | 'trades' | 'symbol'>('volume');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

 
  const [marketCategory, setMarketCategory] = useState<'all' | 'crypto' | 'rwa' | 'equity'>('all');
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const [marketFiltersOpen, setMarketFiltersOpen] = useState(false);

 
  const [selectedKind, setSelectedKind] = useState<DashboardMetricKind>('volume');
  const [capitalFlowNet, setCapitalFlowNet] = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('m');
  const [useMarketFilter, setUseMarketFilter] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [metrics, setMetrics] = useState<ExchangeMetric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

 
  type ChartType = 'area' | 'bar';
  const [chartType, setChartType] = useState<ChartType>('area');

 
  const [latestMetricValues, setLatestMetricValues] = useState<Partial<Record<MetricKind, number>>>({});

 
  const markets: OrderBookStat[] = useMemo(() => {
    if (!stats) return [];
    return [...stats.order_book_stats].sort(
      (a, b) => b.daily_quote_token_volume - a.daily_quote_token_volume
    );
  }, [stats]);

 
  const marketSymbols = useMemo(() => markets.map(m => m.symbol), [markets]);

 
  const filteredMarkets = useMemo(() => {
    let result = markets;

   
    if (marketCategory !== 'all') {
      result = result.filter(m => getCategory(m.symbol) === marketCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(m => 
        m.symbol.toLowerCase().includes(q)
      );
    }

   
    result = [...result].sort((a, b) => {
      let valA: number | string;
      let valB: number | string;

      if (sortBy === 'volume') {
        valA = a.daily_quote_token_volume;
        valB = b.daily_quote_token_volume;
      } else if (sortBy === 'change') {
        valA = a.daily_price_change;
        valB = b.daily_price_change;
      } else if (sortBy === 'trades') {
        valA = a.daily_trades_count;
        valB = b.daily_trades_count;
      } else {
        valA = a.symbol;
        valB = b.symbol;
      }

      if (typeof valA === 'string') {
        return sortDir === 'asc' 
          ? valA.localeCompare(valB as string) 
          : (valB as string).localeCompare(valA);
      }
      return sortDir === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
    });

    return result;
  }, [markets, search, sortBy, sortDir, marketCategory]);

  const visibleMarkets = showAllMarkets ? filteredMarkets : filteredMarkets.slice(0, 10);

  // For volume bars in the markets table (like official Top Markets by OI / Volume lists)
  const visibleMaxVol = useMemo(() => {
    return Math.max(1, ...visibleMarkets.map((m) => m.daily_quote_token_volume || 0));
  }, [visibleMarkets]);

 
  const totalDailyTrades = stats?.daily_trades_count ?? 0;

 
 
 
 
 

 
  const chartData: ChartPoint[] = useMemo(() => {
    if (!metrics.length) return [];
    return sortMetrics(metrics).map((m) => ({
      ts: m.timestamp,
      time: formatChartAxisLabel(m.timestamp, selectedPeriod),
      value: m.data,
    }));
  }, [metrics, selectedPeriod]);

 
  const chartSummary = useMemo(() => {
    if (!chartData.length) return null;
    const values = chartData.map(d => d.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const latest = values[values.length - 1];
    return { sum, avg, max, min, latest, count: values.length };
  }, [chartData]);

 
  const isMobile = useIsMobile();

  const availablePeriods = useMemo(
    () => periodsForMetric(selectedKind),
    [selectedKind]
  );

  const chartHeight = isMobile ? 250 : 420;
  const chartLoadingHeight = isMobile ? 265 : 440;
  const chartErrorHeight = isMobile ? 220 : 380;
  const tickFontSize = isMobile ? 10 : 11;
  const strokeWidth = isMobile ? 1.5 : 2.25;
  const barRadius: [number, number, number, number] = isMobile ? [1, 1, 0, 0] : [3, 3, 0, 0];
  const chartMargin = isMobile
    ? { top: 4, right: 6, left: 0, bottom: 0 }
    : { top: 8, right: 14, left: 2, bottom: 0 };
  const yAxisWidth = isMobile ? 48 : 65;
  const barMaxSize = isMobile ? 5 : 24;

  // Key Metrics list — prioritize Open Interest + 24H Volume at the top as requested
  const visibleMetricKinds = useMemo(() => {
    const excluded = ['maker_fee', 'taker_fee', 'withdraw_fee', 'active_account_count', 'account_count'];
    const base = METRIC_KINDS.filter((k) => !excluded.includes(k.value));

    const priority = ['volume', 'open_interest'];
    const prioritized = priority
      .map((val) => base.find((k) => k.value === val))
      .filter(Boolean) as typeof base;

    const rest = base.filter((k) => !priority.includes(k.value));
    return [...prioritized, ...rest];
  }, []);

 
  const loadStats = async (opts?: { showToast?: boolean; silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    try {
      if (!silent) setStatsLoading(true);
      const data = await getExchangeStats();
      setStats(data);
      if (opts?.showToast) toast.success('Refreshed');
    } catch (err: unknown) {
      console.error(err);
      if (!silent) {
        const message = err instanceof Error ? err.message : 'Check connection';
        toast.error('Failed to load exchange stats', { description: message });
      }
    } finally {
      if (!silent) setStatsLoading(false);
    }
  };

 
  const loadMetrics = async (opts?: { showToastOnError?: boolean; silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (selectedKind === 'capital_flow') {
      if (!silent) setMetricsLoading(false);
      return;
    }

    if (!silent) {
      setMetricsLoading(true);
      setMetricsError(null);
    }

    try {
      const marketToUse = useMarketFilter && selectedMarket ? selectedMarket : undefined;

      if (selectedKind === 'fee_revenue') {
       
        const [makerRes, takerRes, withdrawRes] = await Promise.all([
          getExchangeMetrics(selectedPeriod, 'maker_fee', marketToUse),
          getExchangeMetrics(selectedPeriod, 'taker_fee', marketToUse),
          getExchangeMetrics(selectedPeriod, 'withdraw_fee', marketToUse),
        ]);

        const makerMetrics = makerRes.metrics || [];
        const takerMetrics = takerRes.metrics || [];
        const withdrawMetrics = withdrawRes.metrics || [];

       
        const sumByTs = new Map<number, number>();
        const add = (arr: ExchangeMetric[]) => {
          for (const m of arr) {
            if (m && typeof m.timestamp === 'number') {
              const prev = sumByTs.get(m.timestamp) || 0;
              sumByTs.set(m.timestamp, prev + (m.data || 0));
            }
          }
        };
        add(makerMetrics);
        add(takerMetrics);
        add(withdrawMetrics);

        const combinedMetrics: ExchangeMetric[] = Array.from(sumByTs.entries())
          .map(([timestamp, data]) => ({ timestamp, data }))
          .sort((a, b) => a.timestamp - b.timestamp);

        setMetrics(combinedMetrics);
      } else {
        const data = await getExchangeMetrics(selectedPeriod, selectedKind, marketToUse);
        setMetrics(sortMetrics(data.metrics || []));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load metrics';
      setMetricsError(msg);
      setMetrics([]);

     
      if (msg.includes('invalid period')) {
        toast.error('Period not supported for this metric', {
          description: 'Try a larger period like 7D, 30D or All',
        });
      } else if (opts?.showToastOnError) {
        toast.error('Metrics fetch failed', { description: msg });
      }
    } finally {
      if (!silent) setMetricsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
  }, []);

  useEffect(() => {
    if (!stats) return;

    const fetchLatestForMetrics = async () => {
      const newValues: Partial<Record<MetricKind, number>> = {
        volume: stats.daily_usd_volume,
        trade_count: stats.daily_trades_count,
      };

      const toFetch = METRIC_KINDS.filter(
        (k) => k.value !== 'volume' && k.value !== 'trade_count' && k.value !== 'fee_revenue'
      );

      await Promise.all(
        toFetch.map(async (k) => {
          try {
           
            const latestPeriod = METRIC_PERIOD_SUPPORT[k.value].includes('m')
              ? 'm'
              : defaultPeriodForMetric(k.value);
            const res = await getExchangeMetrics(latestPeriod, k.value);
            if (res.metrics?.length) {
              newValues[k.value] = res.metrics[res.metrics.length - 1].data;
            }
          } catch {
            // ignore per-metric fetch errors when populating latest values
          }
        })
      );

     
      const maker = newValues['maker_fee'] || 0;
      const taker = newValues['taker_fee'] || 0;
      const withdraw = newValues['withdraw_fee'] || 0;
      newValues['fee_revenue'] = maker + taker + withdraw;

      setLatestMetricValues(newValues);
    };

    fetchLatestForMetrics();
  }, [stats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [inflowRes, outflowRes] = await Promise.all([
          getFlowMetrics('w', 'inflow'),
          getFlowMetrics('w', 'outflow'),
        ]);
        if (cancelled) return;
        const net =
          sumMetricData(inflowRes.metrics ?? []) - sumMetricData(outflowRes.metrics ?? []);
        setCapitalFlowNet(net);
      } catch {
        if (!cancelled) setCapitalFlowNet(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedKind === 'capital_flow') return;
    if (!isPeriodSupportedForMetric(selectedKind, selectedPeriod)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPeriod(defaultPeriodForMetric(selectedKind));
      return;
    }
    const kindMeta = METRIC_KINDS.find(k => k.value === selectedKind);
    if (kindMeta && !kindMeta.supportsMarket && useMarketFilter) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUseMarketFilter(false);
    }
    loadMetrics();
  }, [selectedKind, selectedPeriod, useMarketFilter, selectedMarket]);

 
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats({ silent: true });
      if (selectedKind !== 'capital_flow') {
        loadMetrics({ silent: true });
      }
    }, REFRESH_MS);

    return () => clearInterval(interval);
  }, [selectedKind, selectedPeriod, useMarketFilter, selectedMarket]);

  const toggleSort = (key: 'volume' | 'change' | 'trades' | 'symbol') => {
    if (sortBy === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

 
 
 
  const selectMarketForChart = (symbol: string) => {
    setSelectedMarket(symbol);
    setUseMarketFilter(true);  // auto filter chart to this token on click

   
    const kindMeta = METRIC_KINDS.find(k => k.value === selectedKind);
    if (!kindMeta?.supportsMarket) {
      setSelectedKind('volume');
    }

   
    document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

 
  const clearMarketFilter = () => {
    setUseMarketFilter(false);
   
  };

 
  const formatValue = (val: number) => {
    if (selectedKind === 'buyback') {
      return formatNumber(val, true);
    }
    if (selectedKind === 'volume' || selectedKind === 'liquidation_volume' || selectedKind === 'buyback_usdc' || selectedKind === 'fee_revenue') {
      return formatUSD(val, true);
    }
    if (selectedKind === 'tps') {
      return val.toFixed(2);
    }
    return formatNumber(val, true);
  };

 

  const currentKindLabel =
    selectedKind === 'capital_flow'
      ? 'Capital Flow'
      : METRIC_KINDS.find((k) => k.value === selectedKind)?.label || selectedKind;

  const isCapitalFlow = selectedKind === 'capital_flow';

 
  const formatMetricValue = (kind: MetricKind, val: number): string => {
    if (kind === 'buyback') {
      return formatNumber(val);
    }
    if (kind === 'volume' || kind === 'liquidation_volume' || kind === 'buyback_usdc' || kind === 'fee_revenue') {
      return formatUSD(val);
    }
    if (kind === 'tps') {
      return val.toFixed(2);
    }
    return formatNumber(val);
  };

 
  if (view === 'compare') {
    return <CompareHub onNavigate={navigate} />;
  }

  if (view === 'data') {
    return <DataPage onNavigate={navigate} />;
  }

  if (view === 'support') {
    return <SupportPage onNavigate={navigate} />;
  }

  return (
    <div className="app-page dashboard-page">

      <SiteNav active="dashboard" onNavigate={navigate} />

      <div className="page-shell dashboard-shell">
        <div className="dashboard-ambient" aria-hidden="true">
          <span className="dashboard-ambient__orb dashboard-ambient__orb--cyan" />
          <span className="dashboard-ambient__orb dashboard-ambient__orb--violet" />
        </div>

        <div className="dashboard-stats-grid">
          <div className="stat-card stat-card--cyan dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--cyan" aria-hidden="true">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div className="stat-card__label">24H Volume</div>
            <div className="stat-card__value">
              {statsLoading && !stats ? '—' : formatUSD(stats?.daily_usd_volume ?? 0)}
            </div>
          </div>

          <div className="stat-card stat-card--violet dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--violet" aria-hidden="true">
              <Activity className="h-4 w-4" />
            </div>
            <div className="stat-card__label">24H Trades</div>
            <div className="stat-card__value">
              {statsLoading && !stats ? '—' : formatNumber(totalDailyTrades)}
            </div>
          </div>

          <div className="stat-card stat-card--emerald dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--emerald" aria-hidden="true">
              <Layers className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Open Interest</div>
            <div className="stat-card__value">
              {latestMetricValues['open_interest'] !== undefined
                ? formatUSD(latestMetricValues['open_interest'])
                : '—'}
            </div>
          </div>

          <div className="stat-card stat-card--amber dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--amber" aria-hidden="true">
              <Flame className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Top Market</div>
            <div className="stat-card__value text-lg sm:text-xl">
              {markets[0] ? markets[0].symbol : '—'}
            </div>
            {markets[0] && (
              <div className="stat-card__sub">{formatUSD(markets[0].daily_quote_token_volume)}</div>
            )}
          </div>
        </div>

        <section className="dashboard-section">
          <h2 className="dashboard-section__title">Key Metrics</h2>
          <div>
            <div className="card dashboard-card w-full min-w-0">
              <TableScrollZone>
              <div className="table-scroll">
                <table className="w-full text-sm market-table metrics-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMetricKinds.map((m) => {
                    const val = latestMetricValues[m.value];
                    const isSelected = selectedKind === m.value;
                    return (
                      <tr
                        key={m.value}
                        onClick={() => {
                          setSelectedKind(m.value);
                          setTimeout(() => {
                            document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 80);
                        }}
                        className={`cursor-pointer transition-colors ${isSelected ? 'selected-metric' : ''}`}
                      >
                        <td className="font-normal text-white text-sm">
                          {m.value === 'volume' ? '24H Volume' : m.label}
                        </td>
                        <td className="text-right font-mono tabular-nums text-sm">
                          {val !== undefined ? formatMetricValue(m.value, val) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr
                    onClick={() => {
                      setSelectedKind('capital_flow');
                      setTimeout(() => {
                        document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 80);
                    }}
                    className={`cursor-pointer transition-colors ${isCapitalFlow ? 'selected-metric' : ''}`}
                  >
                    <td className="font-normal text-white text-sm">Capital Flow</td>
                    <td className="text-right font-mono tabular-nums text-sm">
                      {capitalFlowNet != null ? (
                        <>
                          {capitalFlowNet >= 0 ? '+' : '−'}
                          {formatUSD(Math.abs(capitalFlowNet), true)}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
              </TableScrollZone>
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <h2 className="dashboard-section__title">Markets</h2>
          <div className="card dashboard-card dashboard-card--markets mb-6 sm:mb-8 w-full min-w-0">
            <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 pt-3 pb-1">
              <span className="text-[11px] text-[#71717a] tabular-nums">
                {showAllMarkets ? filteredMarkets.length : Math.min(10, filteredMarkets.length)} of {filteredMarkets.length}
              </span>
            </div>

          <div className="dashboard-markets-toolbar flex flex-col gap-2 p-3 border-b border-[var(--border)]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#71717a]" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowAllMarkets(false); }}
                placeholder="Search markets…"
                className="input w-full pl-9"
              />
              {search && (
                <button onClick={() => { setSearch(''); setShowAllMarkets(false); }} className="absolute right-3 top-2.5 text-[#71717a]">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              className="markets-filters-toggle"
              aria-expanded={marketFiltersOpen}
              onClick={() => setMarketFiltersOpen((open) => !open)}
            >
              <span>Filters & sort</span>
              {marketFiltersOpen ? (
                <ChevronUp className="h-4 w-4 text-[#71717a]" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#71717a]" aria-hidden="true" />
              )}
            </button>

            <div className={`markets-filters-panel ${marketFiltersOpen ? 'markets-filters-panel--open' : ''}`}>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all','crypto','rwa','equity'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setMarketCategory(cat); setShowAllMarkets(false); }}
                    className={`btn btn-sm text-xs min-w-[66px] justify-center ${marketCategory === cat ? 'btn-active' : ''} ${cat === 'crypto' ? 'btn-crypto' : cat === 'rwa' ? 'btn-rwa' : cat === 'equity' ? 'btn-equity' : ''}`}
                  >
                    {cat === 'all' ? 'All' : cat.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {(['volume', 'change', 'trades', 'symbol'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => toggleSort(key)}
                    className={`btn btn-sm ${sortBy === key ? 'btn-active' : ''}`}
                  >
                    {key === 'volume' && 'Volume'}
                    {key === 'change' && '24h %'}
                    {key === 'trades' && 'Trades'}
                    {key === 'symbol' && 'Symbol'}
                    {sortBy === key && <ArrowUpDown className="h-3 w-3 ml-1" />}
                  </button>
                ))}
                <button onClick={() => { setSearch(''); setSortBy('volume'); setSortDir('desc'); setShowAllMarkets(false); }} className="btn btn-sm text-[#71717a]">
                  Reset
                </button>
              </div>
            </div>
          </div>

          <TableScrollZone className="px-0">
          <div className="table-scroll markets-scroll">
            <table className="w-full text-sm market-table markets-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="text-right">Last</th>
                  <th className="text-right">24H Vol</th>
                  <th className="text-right">Trades</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {statsLoading && filteredMarkets.length === 0 && (
                  <LoadingState variant="table" label="Loading markets…" rows={8} />
                )}

                {visibleMarkets.map((m) => {
                  const up = m.daily_price_change >= 0;
                  const cat = getCategory(m.symbol);
                  const catClass = cat === 'crypto' ? 'cat-crypto' : cat === 'rwa' ? 'cat-rwa' : 'cat-equity';
                  return (
                    <tr 
                      key={m.symbol}
                      onClick={() => selectMarketForChart(m.symbol)}
                      className="cursor-pointer transition-colors"
                    >
                      <td className="font-mono font-normal text-sm text-white tracking-tight">
                        <div className="flex items-center gap-1 min-w-0 max-w-full">
                          <span className="truncate">{m.symbol}</span>
                          <span className={`cat-badge shrink-0 ${catClass}`}>{cat}</span>
                        </div>
                      </td>
                      <td className="text-right font-mono tabular-nums text-[#e4e4e7] text-sm">
                        <div className="flex flex-col items-end w-full min-w-0">
                          <span className="whitespace-nowrap">{formatPrice(m.last_trade_price)}</span>
                          <div className={`text-right text-[10px] sm:text-[10.5px] font-normal tabular-nums ${up ? 'change-up' : 'change-down'}`}>
                            {formatChange(m.daily_price_change)}
                          </div>
                        </div>
                      </td>
                      <td className="text-right font-normal tabular-nums text-sm">
                        <div className="w-full min-w-0 whitespace-nowrap">{formatUSD(m.daily_quote_token_volume)}</div>
                        {/* Mini bar like Lighter's Top Markets by OI / Volume by Market visual */}
                        <div className="vol-mini-bar h-0.5 mt-0.5 bg-[#1a4a34] rounded overflow-hidden w-full">
                          <div
                            className="vol-mini-bar-fill h-0.5 bg-gradient-to-r from-[#22d3ee] to-[#67e8f9] transition-all"
                            style={{
                              width: `${Math.max(4, Math.round(((m.daily_quote_token_volume || 0) / visibleMaxVol) * 100))}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="text-right font-mono tabular-nums text-[#a1a1aa] text-sm">
                        {formatNumber(m.daily_trades_count)}
                      </td>
                      <td>
                        <button 
                          onClick={(e) => { e.stopPropagation(); selectMarketForChart(m.symbol); }} 
                          className="text-[#22d3ee] hover:text-[#67e8f9] p-0.5 sm:p-1 transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredMarkets.length === 0 && !statsLoading && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#71717a]">No results</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </TableScrollZone>

          {filteredMarkets.length > 10 && (
            <div className="p-3 sm:p-4 border-t border-[var(--border)] bg-[#071a10] flex justify-center">
              <button 
                onClick={() => setShowAllMarkets(!showAllMarkets)} 
                className="btn btn-sm"
              >
                {showAllMarkets ? 'Show Top 10' : `Show More (${filteredMarkets.length - 10} more)`}
              </button>
            </div>
          )}
        </div>
        </section>

        <section id="explorer" className="dashboard-section scroll-mt-20">
          <h2 className="dashboard-section__title">Historical Metrics</h2>

          {!isCapitalFlow && (
            <div className="card dashboard-card surface-card p-3 sm:p-4 mb-2.5">
              <div className="chart-toolbar">
                <div className="chart-toolbar__head">
                  <div>
                    <h3 className="chart-toolbar__title">{currentKindLabel}</h3>
                    <p className="chart-toolbar__meta">
                      {availablePeriods.find(p => p.value === selectedPeriod)?.label}
                      {useMarketFilter && selectedMarket ? ` · ${selectedMarket}` : ''}
                    </p>
                  </div>
                  <div className="chart-type-tabs" role="tablist" aria-label="Chart type">
                    {([
                      { value: 'area', label: 'Area' },
                      { value: 'bar', label: 'Bar' },
                    ] as const).map((ct) => (
                      <button
                        key={ct.value}
                        type="button"
                        role="tab"
                        aria-selected={chartType === ct.value}
                        onClick={() => setChartType(ct.value)}
                        className={`chart-type-tab ${chartType === ct.value ? 'chart-type-tab--active' : ''}`}
                      >
                        {ct.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chart-toolbar__row">
                  <div className="timeframe-tabs" role="tablist" aria-label="Time period">
                    {availablePeriods.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        role="tab"
                        aria-selected={selectedPeriod === p.value}
                        onClick={() => setSelectedPeriod(p.value)}
                        className={`timeframe-tab ${selectedPeriod === p.value ? 'timeframe-tab--active' : ''}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-[#a1a1aa] shrink-0">
                    <input
                      type="checkbox"
                      checked={useMarketFilter}
                      disabled={!METRIC_KINDS.find(k => k.value === selectedKind)?.supportsMarket}
                      onChange={(e) => setUseMarketFilter(e.target.checked)}
                      className="accent-[#22d3ee] w-3.5 h-3.5"
                    />
                    Market
                  </label>
                </div>

                {useMarketFilter && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedMarket}
                      onChange={(e) => setSelectedMarket(e.target.value)}
                      className="select text-xs min-w-[120px] py-1.5 flex-1 sm:flex-none"
                    >
                      <option value="">Select market…</option>
                      {marketSymbols.slice(0, 60).map(sym => (
                        <option key={sym} value={sym}>{sym}</option>
                      ))}
                    </select>
                    <button onClick={clearMarketFilter} className="btn btn-sm p-1.5 text-[#ef4444]" aria-label="Clear market filter">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isCapitalFlow ? (
            <div className="mb-2.5">
              <div className="text-sm text-white mb-2.5 px-0.5">{currentKindLabel}</div>
              <InflowOutflowSection embedded />
            </div>
          ) : (
          <div className="card dashboard-card surface-card p-2 sm:p-3 lg:p-4">
            {metricsLoading ? (
              <LoadingState
                variant="chart"
                label="Loading chart…"
                minHeight={chartLoadingHeight}
              />
            ) : metricsError ? (
              <div style={{ height: `${chartErrorHeight}px` }} className="flex flex-col items-center justify-center text-center p-4">
                <div className="text-[#ef4444] mb-1 text-xs">Failed to load chart</div>
                <button onClick={() => loadMetrics({ showToastOnError: true })} className="btn btn-sm text-xs">Retry</button>
              </div>
            ) : chartData.length > 0 ? (
              <>
                <div>
                  <div style={{ height: `${chartHeight}px` }} className="dashboard-chart chart-surface compare-chart w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === 'area' && (
                        <AreaChart data={chartData} margin={chartMargin}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35}/>
                              <stop offset="55%" stopColor="#22d3ee" stopOpacity={0.12}/>
                              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 6" stroke="rgba(36, 38, 58, 0.9)" vertical={false} />
                          <XAxis
                            dataKey="ts"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(ts) => formatChartAxisLabel(Number(ts), selectedPeriod)}
                            tick={{ fill: '#71717a', fontSize: tickFontSize }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={isMobile ? 22 : 36}
                            dy={4}
                          />
                          <YAxis
                            tickFormatter={formatValue}
                            tick={{ fill: '#71717a', fontSize: tickFontSize }}
                            tickLine={false}
                            axisLine={false}
                            width={yAxisWidth}
                          />
                          <Tooltip
                            content={
                              <DashboardTooltip
                                valueLabel={currentKindLabel}
                                formatValue={formatValue}
                              />
                            }
                            labelFormatter={(ts) => formatChartTooltipLabel(Number(ts))}
                            cursor={{ stroke: 'rgba(34, 211, 238, 0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            name={currentKindLabel}
                            stroke="#22d3ee"
                            strokeWidth={strokeWidth}
                            fill="url(#colorValue)"
                            activeDot={{ r: 3, stroke: '#0a0b12', strokeWidth: 1, fill: '#67e8f9' }}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      )}

                      {chartType === 'bar' && (
                        <BarChart data={chartData} margin={chartMargin}>
                          <CartesianGrid strokeDasharray="3 6" stroke="rgba(36, 38, 58, 0.9)" vertical={false} />
                          <XAxis
                            dataKey="ts"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(ts) => formatChartAxisLabel(Number(ts), selectedPeriod)}
                            tick={{ fill: '#71717a', fontSize: tickFontSize }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={isMobile ? 22 : 36}
                            dy={4}
                          />
                          <YAxis
                            tickFormatter={formatValue}
                            tick={{ fill: '#71717a', fontSize: tickFontSize }}
                            tickLine={false}
                            axisLine={false}
                            width={yAxisWidth}
                          />
                          <Tooltip
                            content={
                              <DashboardTooltip
                                valueLabel={currentKindLabel}
                                formatValue={formatValue}
                              />
                            }
                            labelFormatter={(ts) => formatChartTooltipLabel(Number(ts))}
                            cursor={{ fill: 'rgba(34, 211, 238, 0.06)' }}
                          />
                          <Bar
                            dataKey="value"
                            name={currentKindLabel}
                            fill="#67e8f9"
                            fillOpacity={0.88}
                            radius={barRadius}
                            activeBar={false}
                            maxBarSize={barMaxSize}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  {chartSummary && (
                    <div className="chart-summary-grid">
                      <div className="chart-summary-item">
                        <span className="chart-summary-item__label">Points</span>
                        <span className="chart-summary-item__value">{chartSummary.count}</span>
                      </div>
                      <div className="chart-summary-item">
                        <span className="chart-summary-item__label">Sum</span>
                        <span className="chart-summary-item__value">{formatValue(chartSummary.sum)}</span>
                      </div>
                      <div className="chart-summary-item">
                        <span className="chart-summary-item__label">Avg</span>
                        <span className="chart-summary-item__value">{formatValue(chartSummary.avg)}</span>
                      </div>
                      <div className="chart-summary-item">
                        <span className="chart-summary-item__label">Peak</span>
                        <span className="chart-summary-item__value chart-summary-item__value--up">{formatValue(chartSummary.max)}</span>
                      </div>
                      <div className="chart-summary-item">
                        <span className="chart-summary-item__label">Low</span>
                        <span className="chart-summary-item__value chart-summary-item__value--down">{formatValue(chartSummary.min)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-[#71717a] text-xs">No data</div>
            )}

          </div>
          )}
        </section>

        <div className="dashboard-insights mt-8 sm:mt-10 grid md:grid-cols-2 gap-3">
          <div className="card dashboard-card dashboard-insight-card dashboard-insight-card--cyan p-3 sm:p-4">
            <h3 className="dashboard-insight-card__title">Top 5 Volume</h3>
            <div className="space-y-1.5 text-sm">
              {(() => {
                const top = markets.slice(0, 5);
                const maxVol = Math.max(1, ...top.map(m => m.daily_quote_token_volume));
                return top.map((m, idx) => {
                  const pct = Math.max(6, Math.round((m.daily_quote_token_volume / maxVol) * 100));
                  return (
                    <div 
                      key={m.symbol} 
                      onClick={() => selectMarketForChart(m.symbol)}
                      className="insight-row group flex flex-col gap-0.5 py-1 px-2 rounded cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono w-4 text-right text-xs text-[#52525b] group-hover:text-[#22d3ee] transition-colors">{idx + 1}</span>
                          <span className="font-normal text-sm tracking-tighter text-white group-hover:text-[#22d3ee] transition-colors">{m.symbol}</span>
                        </div>
                        <div className="font-normal tabular-nums text-sm text-[#e4e4e7]">{formatUSD(m.daily_quote_token_volume)}</div>
                      </div>
                      {/* Visual bar like official Top Markets by OI lists */}
                      <div className="vol-mini-bar h-1 bg-[#1a4a34] rounded overflow-hidden">
                        <div 
                          className="vol-mini-bar-fill h-1 bg-gradient-to-r from-[#22d3ee] to-[#67e8f9] transition-all" 
                          style={{ width: `${pct}%` }} 
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="card dashboard-card dashboard-insight-card dashboard-insight-card--violet p-3 sm:p-4">
            <h3 className="dashboard-insight-card__title">24H Movers</h3>
            <div className="grid grid-cols-1 gap-y-0.5 text-sm">
              {[...markets]
                .sort((a, b) => Math.abs(b.daily_price_change) - Math.abs(a.daily_price_change))
                .slice(0, 6)
                .map(m => {
                  const up = m.daily_price_change > 0;
                  return (
                    <div 
                      key={m.symbol} 
                      onClick={() => selectMarketForChart(m.symbol)}
                      className="insight-row flex justify-between items-center py-1 px-2 rounded cursor-pointer"
                    >
                      <span className="font-mono font-normal text-sm">{m.symbol}</span>
                      <span className={`font-normal tabular-nums text-sm ${up ? 'change-up' : 'change-down'}`}>
                        {formatChange(m.daily_price_change)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        <footer className="site-footer">
          <a href="https://x.com/intent/follow?screen_name=ajey_eth" target="_blank" rel="noopener noreferrer">
            @ajey_eth
          </a>
          <span className="site-footer__sep">·</span>
          <a href="https://github.com/ahomelessdevloper" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}

export default App;
