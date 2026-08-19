import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Gauge,
  Layers,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "../components/LoadingState";
import { SiteNav, type SiteView } from "../components/SiteNav";
import { TableScrollZone } from "../components/TableScrollZone";
import { formatChange } from "../lib/api";
import {
  fetchTopPerpDexes,
  formatExecBps,
  formatUsdMetric,
  type PerpDexRow,
  type PerpDexSnapshot,
} from "../lib/perpDex";

interface DataPageProps {
  onNavigate: (view: SiteView) => void;
}

type SortKey = "volume24h" | "oi" | "tvl" | "execCostBps" | "name";
const REFRESH_MS = 120_000;

function numericValue(row: PerpDexRow, key: SortKey): number {
  if (key === "name") return 0;
  const value = row[key];
  return value == null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value;
}

function venueTone(id: string): "lighter" | "hyperliquid" | null {
  if (id === "lighter") return "lighter";
  if (id === "hyperliquid") return "hyperliquid";
  return null;
}

export default function DataPage({ onNavigate }: DataPageProps) {
  const [snapshot, setSnapshot] = useState<PerpDexSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("volume24h");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const next = await fetchTopPerpDexes();
      setSnapshot(next);
    } catch (err: unknown) {
      if (!silent) {
        toast.error("Perp DEX data failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = window.setInterval(() => load(true), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
      return;
    }
    setSortBy(key);
    setSortDir(key === "name" || key === "execCostBps" ? "asc" : "desc");
  };

  const rows = useMemo(() => {
    const list = snapshot?.rows ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((row) => row.name.toLowerCase().includes(q) || row.id.includes(q))
      : list;

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "name") {
        const cmp = a.name.localeCompare(b.name);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const av = numericValue(a, sortBy);
      const bv = numericValue(b, sortBy);
      const cmp = av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [snapshot, search, sortBy, sortDir]);

  const cheapestExec = useMemo(() => {
    const costs = (snapshot?.rows ?? [])
      .map((row) => row.execCostBps)
      .filter((value): value is number => value != null && Number.isFinite(value) && value >= 0);
    return costs.length ? Math.min(...costs) : null;
  }, [snapshot]);

  const maxVolume = useMemo(
    () => Math.max(0, ...(snapshot?.rows ?? []).map((row) => row.volume24h ?? 0)),
    [snapshot]
  );

  return (
    <div className="app-page data-page">
      <SiteNav active="data" onNavigate={onNavigate} />

      <div className="page-shell data-shell">
        <header className="compare-page-head mb-4 sm:mb-5">
          <h1 className="compare-page-head__title">Top 50 Perp DEXes</h1>
          <p className="compare-page-head__sub">
            Volume, open interest, TVL, and implied execution cost across the largest perpetual DEXes.
          </p>
        </header>

        <div className="dashboard-stats-grid">
          <div className="stat-card stat-card--cyan dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--cyan" aria-hidden="true">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div className="stat-card__label">24H Volume</div>
            <div className="stat-card__value">{formatUsdMetric(snapshot?.totals.volume24h ?? null)}</div>
          </div>
          <div className="stat-card stat-card--violet dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--violet" aria-hidden="true">
              <Activity className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Open Interest</div>
            <div className="stat-card__value">{formatUsdMetric(snapshot?.totals.oi ?? null)}</div>
          </div>
          <div className="stat-card stat-card--emerald dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--emerald" aria-hidden="true">
              <Layers className="h-4 w-4" />
            </div>
            <div className="stat-card__label">TVL</div>
            <div className="stat-card__value">{formatUsdMetric(snapshot?.totals.tvl ?? null)}</div>
          </div>
          <div className="stat-card stat-card--amber dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--amber" aria-hidden="true">
              <Gauge className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Best Exec Cost</div>
            <div className="stat-card__value">{formatExecBps(cheapestExec)}</div>
            <div className="stat-card__sub">Fees / volume</div>
          </div>
        </div>

        <section className="card data-table-card">
          <div className="data-toolbar">
            <div className="data-search">
              <Search className="data-search__icon" aria-hidden="true" />
              <input
                className="input data-search__input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search DEX"
                aria-label="Search perp DEX"
              />
              {search && (
                <button type="button" className="data-search__clear" onClick={() => setSearch("")} aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="data-toolbar__meta">{rows.length} venues</p>
          </div>

          {loading && !snapshot ? (
            <LoadingState variant="card" label="Loading top perp DEXes…" minHeight={360} />
          ) : (
            <TableScrollZone>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="data-table__rank">#</th>
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("name")}>
                        DEX <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("volume24h")}>
                        Volume 24h <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("oi")}>
                        Open Interest <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("execCostBps")}>
                        Exec Cost <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("tvl")}>
                        TVL <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const tone = venueTone(row.id);
                    const isCheapest =
                      cheapestExec != null && row.execCostBps != null && row.execCostBps === cheapestExec;
                    const volPct = maxVolume > 0 && row.volume24h != null ? (row.volume24h / maxVolume) * 100 : 0;
                    return (
                      <tr
                        key={row.id}
                        className={[
                          tone ? `data-row--${tone}` : "",
                          isCheapest ? "data-row--cheap" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <td className="data-table__rank">{index + 1}</td>
                        <td>
                          <div className="data-dex">
                            {row.logo ? (
                              <img
                                src={row.logo}
                                alt=""
                                className="data-dex__logo"
                                width={22}
                                height={22}
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <span className="data-dex__logo data-dex__logo--fallback" aria-hidden="true">
                                {row.name.slice(0, 1)}
                              </span>
                            )}
                            <div className="data-dex__meta">
                              <span className="data-dex__name">{row.name}</span>
                              {row.chains[0] && <span className="data-dex__chain">{row.chains[0]}</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="data-metric">
                            <span>{formatUsdMetric(row.volume24h)}</span>
                            {row.volume24h != null && (
                              <span className="data-vol-bar" aria-hidden="true">
                                <i style={{ width: `${Math.max(volPct, 4)}%` }} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="data-metric">
                            <span>{formatUsdMetric(row.oi)}</span>
                            {row.oiChange1d != null && (
                              <span className={row.oiChange1d >= 0 ? "data-chg data-chg--up" : "data-chg data-chg--down"}>
                                {formatChange(row.oiChange1d)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className={`data-metric ${isCheapest ? "data-metric--win" : ""}`}>
                            <span>{formatExecBps(row.execCostBps)}</span>
                            {row.fees24h != null && (
                              <span className="data-metric__sub">{formatUsdMetric(row.fees24h)} fees</span>
                            )}
                          </div>
                        </td>
                        <td>{formatUsdMetric(row.tvl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScrollZone>
          )}
        </section>

        <p className="data-footnote">
          Universe from DefiLlama perp DEXes (top 50 by open interest). Volume from CoinGecko. TVL and fees from DefiLlama.
          Execution cost is implied taker cost: 24h protocol fees ÷ 24h volume.
        </p>
      </div>
    </div>
  );
}
