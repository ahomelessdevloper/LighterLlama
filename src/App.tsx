import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, X,
  ArrowUpDown, ChevronRight
} from 'lucide-react';
import { SiteNav, type SiteView } from './components/SiteNav';
import CompareHub from './pages/CompareHub';
import SupportPage from './pages/SupportPage';

import { getSiteViewFromHash, normalizeSupportHash, siteViewHash } from './lib/siteNav';
import { 
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Area, AreaChart, BarChart, Bar 
} from 'recharts';
import { format, fromUnixTime } from 'date-fns';
import { toast } from 'sonner';
import { ChartDownloadButton } from './components/ChartDownloadButton';
import { LoadingState } from './components/LoadingState';
import { InflowOutflowSection } from './components/InflowOutflowSection';
import { chartDownloadFilename } from './lib/chartDownload';

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
import { METRIC_KINDS, PERIODS } from './types';

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

function useIsMobile(breakpoint = 639) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    update(mq);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}

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

 
  const chartExportRef = useRef<HTMLDivElement>(null);

 
  const marketsExportRef = useRef<HTMLDivElement>(null);

 
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

  const chartHeight = isMobile ? 175 : 420;
  const chartLoadingHeight = isMobile ? 185 : 440;
  const chartErrorHeight = isMobile ? 160 : 380;
  const tickFontSize = isMobile ? 7.5 : 11;
  const strokeWidth = isMobile ? 1.5 : 2.25;
  const barRadius: [number, number, number, number] = isMobile ? [1, 1, 0, 0] : [3, 3, 0, 0];
  const chartMargin = isMobile
    ? { top: 2, right: 4, left: -4, bottom: 0 }
    : { top: 8, right: 14, left: 2, bottom: 0 };
  const yAxisWidth = isMobile ? 42 : 65;
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
           
            const res = await getExchangeMetrics('m', k.value);
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

  const statsCardsRef = useRef<HTMLDivElement>(null);
  const keyMetricsRef = useRef<HTMLDivElement>(null);

  const chartExportFilename = useMemo(() => {
    const marketPart = useMarketFilter && selectedMarket ? `-${selectedMarket}` : '';
    return chartDownloadFilename(`${selectedKind}${marketPart}-${selectedPeriod}`);
  }, [selectedKind, selectedPeriod, selectedMarket, useMarketFilter]);

  const marketsExportFilename = useMemo(() => {
    const cat = marketCategory === 'all' ? 'all' : marketCategory;
    const mode = showAllMarkets ? 'all' : 'top10';
    return chartDownloadFilename(`markets-${cat}-${mode}`);
  }, [marketCategory, showAllMarkets]);
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

 
  const tooltipFormatter = (value: number | string | null | undefined) => {
    const num = typeof value === 'number' ? value : Number(value ?? 0);
    return [formatValue(num), currentKindLabel];
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

  if (view === 'support') {
    return <SupportPage onNavigate={navigate} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0b12] text-white">

      <SiteNav active="dashboard" onNavigate={navigate} />

      <div className="max-w-[1280px] mx-auto w-full min-w-0 px-4 sm:px-6 pt-5 sm:pt-7 pb-10 sm:pb-16">

        <div ref={statsCardsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-5 sm:mb-7 downloadable-block relative">
          <ChartDownloadButton
            targetRef={statsCardsRef}
            filename={chartDownloadFilename('dashboard-stats')}
            className="downloadable-block__dl"
          />
          <div className="stat-card stat-card--cyan">
            <div className="stat-card__label">24H Volume</div>
            <div className="stat-card__value">
              {statsLoading && !stats ? '—' : formatUSD(stats?.daily_usd_volume ?? 0)}
            </div>
          </div>

          <div className="stat-card stat-card--violet">
            <div className="stat-card__label">24H Trades</div>
            <div className="stat-card__value">
              {statsLoading && !stats ? '—' : formatNumber(totalDailyTrades)}
            </div>
          </div>

          <div className="stat-card stat-card--emerald">
            <div className="stat-card__label">Open Interest</div>
            <div className="stat-card__value">
              {latestMetricValues['open_interest'] !== undefined
                ? formatUSD(latestMetricValues['open_interest'])
                : '—'}
            </div>
          </div>

          <div className="stat-card stat-card--amber">
            <div className="stat-card__label">Top Market</div>
            <div className="stat-card__value text-lg sm:text-xl">
              {markets[0] ? markets[0].symbol : '—'}
            </div>
            {markets[0] && (
              <div className="stat-card__sub">{formatUSD(markets[0].daily_quote_token_volume)}</div>
            )}
          </div>
        </div>

        <div className="mb-5 sm:mb-7 w-full">
          <div className="card-head-dl mb-2.5">
            <h2 className="section-title card-head-dl__title !mb-0">Key Metrics</h2>
            <ChartDownloadButton
              targetRef={keyMetricsRef}
              filename={chartDownloadFilename('key-metrics')}
            />
          </div>
          <div ref={keyMetricsRef} className="downloadable-block">
            <div className="card w-full min-w-0">
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
            </div>
          </div>
        </div>

        <div ref={marketsExportRef} className="w-full">
          <div className="card-head-dl mb-2.5">
            <h2 className="section-title card-head-dl__title !mb-0">Markets</h2>
            <ChartDownloadButton targetRef={marketsExportRef} filename={marketsExportFilename} />
          </div>
          <div className="card mb-6 sm:mb-8 w-full min-w-0">
            <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 pt-3 pb-1">
              <span className="text-[11px] text-[#71717a] tabular-nums">
                {showAllMarkets ? filteredMarkets.length : Math.min(10, filteredMarkets.length)} of {filteredMarkets.length}
              </span>
            </div>

          <div className="flex flex-col gap-2 p-3 border-b border-[#24263a]">
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
                        <div className="vol-mini-bar h-0.5 mt-0.5 bg-[#24263a] rounded overflow-hidden w-full">
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

          {filteredMarkets.length > 10 && (
            <div className="p-3 sm:p-4 border-t border-[#24263a] bg-[#10121a] flex justify-center">
              <button 
                onClick={() => setShowAllMarkets(!showAllMarkets)} 
                className="btn btn-sm"
              >
                {showAllMarkets ? 'Show Top 10' : `Show More (${filteredMarkets.length - 10} more)`}
              </button>
            </div>
          )}
        </div>
        </div>

        <div id="explorer" className="scroll-mt-20">
          <div className="card-head-dl mb-2.5">
            <h2 className="section-title card-head-dl__title !mb-0">Historical Metrics</h2>
            <ChartDownloadButton targetRef={chartExportRef} filename={chartExportFilename} />
          </div>

          {!isCapitalFlow && (
            <div className="card p-3 sm:p-4 mb-2.5">
              <div className="flex flex-col gap-3">
                <div className="text-sm text-white">
                  {currentKindLabel}
                  <span className="text-[#71717a]">
                    {' · '}{PERIODS.find(p => p.value === selectedPeriod)?.label}
                    {useMarketFilter && selectedMarket ? ` · ${selectedMarket}` : ''}
                  </span>
                </div>

                <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
                  {PERIODS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setSelectedPeriod(p.value)}
                      className={`btn btn-sm flex-shrink-0 text-xs ${selectedPeriod === p.value ? 'btn-active' : ''}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-[#a1a1aa]">
                    <input
                      type="checkbox"
                      checked={useMarketFilter}
                      disabled={!METRIC_KINDS.find(k => k.value === selectedKind)?.supportsMarket}
                      onChange={(e) => setUseMarketFilter(e.target.checked)}
                      className="accent-[#22d3ee] w-3 h-3"
                    />
                    Filter by market
                  </label>
                  {useMarketFilter && (
                    <>
                      <select
                        value={selectedMarket}
                        onChange={(e) => setSelectedMarket(e.target.value)}
                        className="select text-xs min-w-[88px] py-1"
                      >
                        <option value="">Select…</option>
                        {marketSymbols.slice(0, 60).map(sym => (
                          <option key={sym} value={sym}>{sym}</option>
                        ))}
                      </select>
                      <button onClick={clearMarketFilter} className="btn btn-sm p-1 text-[#ef4444]">
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#24263a]">
                  <div className="flex gap-1">
                    {([
                      { value: 'area', label: 'Area' },
                      { value: 'bar', label: 'Bar' },
                    ] as const).map((ct) => (
                      <button
                        key={ct.value}
                        onClick={() => setChartType(ct.value)}
                        className={`btn btn-sm text-xs ${chartType === ct.value ? 'btn-active' : ''}`}
                      >
                        {ct.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isCapitalFlow ? (
            <div className="mb-2.5">
              <div className="text-sm text-white mb-2.5 px-0.5">{currentKindLabel}</div>
              <InflowOutflowSection embedded />
            </div>
          ) : (
          <div className="card p-2 lg:p-4">
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
                <div ref={chartExportRef}>
                  <div style={{ height: `${chartHeight}px` }} className="w-full px-0.5">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === 'area' && (
                        <AreaChart data={chartData} margin={chartMargin}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45}/>
                              <stop offset="35%" stopColor="#67e8f9" stopOpacity={0.28}/>
                              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.03}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="2 2" stroke="#24263a" />
                          <XAxis
                            dataKey="ts"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(ts) => formatChartAxisLabel(Number(ts), selectedPeriod)}
                            tick={{ fill: '#71717a', fontSize: tickFontSize }}
                            tickLine={{ stroke: '#24263a' }}
                            minTickGap={isMobile ? 18 : 32}
                          />
                          <YAxis tickFormatter={formatValue} tick={{ fill: '#71717a', fontSize: tickFontSize }} tickLine={{ stroke: '#24263a' }} width={yAxisWidth} />
                          <Tooltip 
                            contentStyle={{ background: '#15171f', border: '1px solid #32354a', borderRadius: 8, color: '#f4f4f5', fontSize: '10px' }} 
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={tooltipFormatter as any}
                            labelFormatter={(ts) => formatChartTooltipLabel(Number(ts))}
                            labelStyle={{ color: '#a1a1aa' }} 
                            cursor={{ fill: 'rgba(34,211,238,0.06)' }}
                          />
                          <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={strokeWidth} fill="url(#colorValue)" />
                          <Line type="natural" dataKey="value" stroke="#67e8f9" strokeWidth={1} dot={false} />
                        </AreaChart>
                      )}

                      {chartType === 'bar' && (
                        <BarChart data={chartData} margin={chartMargin}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#24263a" />
                          <XAxis
                            dataKey="ts"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(ts) => formatChartAxisLabel(Number(ts), selectedPeriod)}
                            tick={{ fill: '#71717a', fontSize: tickFontSize }}
                            tickLine={{ stroke: '#24263a' }}
                            minTickGap={isMobile ? 18 : 32}
                          />
                          <YAxis tickFormatter={formatValue} tick={{ fill: '#71717a', fontSize: tickFontSize }} tickLine={{ stroke: '#24263a' }} width={yAxisWidth} />
                          <Tooltip 
                            contentStyle={{ background: '#15171f', border: '1px solid #32354a', borderRadius: 8, color: '#f4f4f5', fontSize: '10px' }} 
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={tooltipFormatter as any}
                            labelFormatter={(ts) => formatChartTooltipLabel(Number(ts))}
                            labelStyle={{ color: '#a1a1aa' }} 
                            cursor={{ fill: 'rgba(103,232,249,0.06)' }}
                          />
                          <Bar 
                            dataKey="value" 
                            fill="#67e8f9" 
                            radius={barRadius} 
                            activeBar={false}
                            maxBarSize={barMaxSize}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  {chartSummary && (
                    <div className="chart-summary grid grid-cols-5 gap-x-1 sm:gap-x-2 gap-y-0.5 sm:gap-y-1 border-t border-[#24263a] pt-1 sm:pt-1.5 px-0.5 sm:px-1 text-[9px] sm:text-xs md:text-sm mt-0.5 sm:mt-1">
                      <div><span className="text-[#71717a]">pts </span><span className="font-normal tabular-nums">{chartSummary.count}</span></div>
                      <div><span className="text-[#71717a]">sum </span><span className="font-normal tabular-nums text-white">{formatValue(chartSummary.sum)}</span></div>
                      <div><span className="text-[#71717a]">avg </span><span className="font-normal tabular-nums">{formatValue(chartSummary.avg)}</span></div>
                      <div><span className="text-[#71717a]">peak </span><span className="font-normal tabular-nums text-[#34d399]">{formatValue(chartSummary.max)}</span></div>
                      <div><span className="text-[#71717a]">low </span><span className="font-normal tabular-nums text-[#fb7185]">{formatValue(chartSummary.min)}</span></div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-[#71717a] text-xs">No data</div>
            )}

          </div>
          )}
        </div>

        <div className="mt-8 sm:mt-10 grid md:grid-cols-2 gap-3">
          <div className="card p-3 sm:p-4">
            <h3 className="section-label mb-2">Top 5 Volume</h3>
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
                      <div className="vol-mini-bar h-1 bg-[#24263a] rounded overflow-hidden">
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

          <div className="card p-3 sm:p-4">
            <h3 className="section-label mb-2">24H Movers</h3>
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
