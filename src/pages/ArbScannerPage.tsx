import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  GitCompareArrows,
  Info,
  Radio,
  Search,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "../components/LoadingState";
import { SiteNav, type SiteView } from "../components/SiteNav";
import { TableScrollZone } from "../components/TableScrollZone";
import {
  consensusDisplayPrice,
  displayPrice,
  fetchArbSnapshot,
  formatArbPrice,
  formatBps,
  formatSignedBps,
  formatUsdCompact,
  VENUE_BY_ID,
  VENUES,
  type ArbMarket,
  type ArbSnapshot,
  type VenueId,
} from "../lib/arbScanner";

interface ArbScannerPageProps {
  onNavigate: (view: SiteView) => void;
}

type SortKey = "gap" | "net" | "symbol";
type GapFilter = 0 | 10 | 25 | 50;
type PriceMode = "dev" | "abs";

const REFRESH_MS = 15_000;
const GAP_FILTERS: Array<{ value: GapFilter; label: string }> = [
  { value: 0, label: "All" },
  { value: 10, label: "≥ 10 bps" },
  { value: 25, label: "≥ 25 bps" },
  { value: 50, label: "≥ 50 bps" },
];

function venueCellClass(market: ArbMarket, venue: VenueId): string {
  const quote = market.byVenue[venue];
  if (!quote) return "";
  if (market.low.venue === market.high.venue) return "";
  if (quote.venue === market.low.venue) return "arb-px--low";
  if (quote.venue === market.high.venue) return "arb-px--high";
  return "";
}

function gapTone(bps: number): string {
  if (bps >= 40) return "arb-gap--hot";
  if (bps >= 15) return "arb-gap--strong";
  if (bps >= 5) return "arb-gap--mid";
  return "arb-gap--mute";
}

function confidenceLabel(market: ArbMarket): string {
  if (market.outlierVenue) {
    return `Gap driven by ${VENUE_BY_ID[market.outlierVenue].short} alone — usually a stale mark, not an arb`;
  }
  if (market.venueCount <= 2) return "Only 2 venues quote this ticker — nothing to cross-check against";
  if (market.excludedCount > 0) {
    return `${market.excludedCount} listing(s) on this ticker priced too far off to be the same asset, and were excluded`;
  }
  return `${market.venueCount} venues agree on the price`;
}

export default function ArbScannerPage({ onNavigate }: ArbScannerPageProps) {
  const [snapshot, setSnapshot] = useState<ArbSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [minBps, setMinBps] = useState<GapFilter>(10);
  const [lighterOnly, setLighterOnly] = useState(false);
  const [hideWeak, setHideWeak] = useState(true);
  const [priceMode, setPriceMode] = useState<PriceMode>("dev");
  const [sortBy, setSortBy] = useState<SortKey>("gap");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    // A scan fans out to seven venues; skip the tick rather than stack requests.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (!silent) setLoading(true);
      const next = await fetchArbSnapshot();
      setSnapshot(next);
    } catch (err: unknown) {
      if (!silent) {
        toast.error("Arb scan failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      inFlight.current = false;
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
    setSortDir(key === "symbol" ? "asc" : "desc");
  };

  const liveVenues = useMemo(() => {
    if (!snapshot) return 0;
    return VENUES.filter((v) => snapshot.venues[v.id]?.ok).length;
  }, [snapshot]);

  const offlineVenues = useMemo(() => {
    if (!snapshot) return [];
    return VENUES.filter((v) => !snapshot.venues[v.id]?.ok);
  }, [snapshot]);

  const rows = useMemo(() => {
    const list = snapshot?.markets ?? [];
    const q = search.trim().toLowerCase();
    const filtered = list.filter((row) => {
      if (row.gapBps < minBps) return false;
      if (hideWeak && row.confidence === "low") return false;
      if (lighterOnly && !row.byVenue.lighter) return false;
      if (!q) return true;
      return (
        row.display.toLowerCase().includes(q) ||
        row.base.toLowerCase().includes(q) ||
        row.quotes.some((quote) => quote.nativeSymbol.toLowerCase().includes(q))
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortBy === "symbol") cmp = a.display.localeCompare(b.display);
      else if (sortBy === "net") cmp = a.netBps - b.netBps;
      else cmp = a.gapBps - b.gapBps;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [snapshot, search, minBps, lighterOnly, hideWeak, sortBy, sortDir]);

  const best = useMemo(
    () => rows.reduce<ArbMarket | null>((acc, row) => (!acc || row.netBps > acc.netBps ? row : acc), null),
    [rows]
  );
  const profitable = rows.filter((row) => row.netBps > 0).length;
  const maxGap = rows.reduce((acc, row) => Math.max(acc, row.gapBps), 0);
  const colSpan = priceMode === "abs" ? VENUES.length + 4 : VENUES.length + 5;

  return (
    <div className="app-page arb-page">
      <SiteNav active="arb" onNavigate={onNavigate} />

      <div className="page-shell data-shell">
        <header className="compare-page-head mb-4 sm:mb-5">
          <h1 className="compare-page-head__title">Arb Scanner</h1>
          <p className="compare-page-head__sub">
            Perp mark prices across Lighter, Hyperliquid, Binance, Bybit, OKX, Bitget, and Aster,
            matched by asset and normalised to one token. <strong>Gap</strong> is the cheapest venue
            against the richest; <strong>Net</strong> subtracts the estimated taker fee on both legs.
          </p>
        </header>

        <div className="dashboard-stats-grid">
          <div className="stat-card stat-card--cyan dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--cyan" aria-hidden="true">
              <Zap className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Best Net Edge</div>
            <div className="stat-card__value">{best ? formatBps(best.netBps) : "—"}</div>
            <div className="stat-card__sub">
              {best
                ? `${best.display} · buy ${VENUE_BY_ID[best.low.venue].short} / sell ${VENUE_BY_ID[best.high.venue].short}`
                : "after fees"}
            </div>
          </div>
          <div className="stat-card stat-card--amber dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--amber" aria-hidden="true">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Positive After Fees</div>
            <div className="stat-card__value">{snapshot ? profitable : "—"}</div>
            <div className="stat-card__sub">of {rows.length} in view</div>
          </div>
          <div className="stat-card stat-card--violet dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--violet" aria-hidden="true">
              <GitCompareArrows className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Matched Markets</div>
            <div className="stat-card__value">{snapshot ? snapshot.markets.length : "—"}</div>
            <div className="stat-card__sub">
              {snapshot
                ? `${snapshot.ambiguousCount} ticker clashes excluded`
                : "scanning"}
            </div>
          </div>
          <div className="stat-card stat-card--emerald dashboard-stat-card">
            <div className="dashboard-stat-card__icon dashboard-stat-card__icon--emerald" aria-hidden="true">
              <Radio className="h-4 w-4" />
            </div>
            <div className="stat-card__label">Venues Live</div>
            <div className="stat-card__value">
              {snapshot ? `${liveVenues}/${VENUES.length}` : "—"}
            </div>
            <div className="stat-card__sub">
              {snapshot ? formatUpdated(snapshot.updatedAt) : "refreshing every 15s"}
            </div>
          </div>
        </div>

        <div className="arb-venue-bar" aria-label="Venue status">
          {VENUES.map((venue) => {
            const status = snapshot?.venues[venue.id];
            const on = status?.ok ?? false;
            return (
              <span
                key={venue.id}
                className={`arb-venue-pill ${on ? "arb-venue-pill--on" : snapshot ? "arb-venue-pill--off" : ""}`}
                title={
                  on
                    ? `${venue.label} · ${status?.count} markets · ~${venue.takerBps} bps taker`
                    : `${venue.label} unreachable: ${status?.error ?? "not scanned yet"}`
                }
              >
                <i aria-hidden="true" />
                {venue.short}
                <em>{status?.ok ? status.count : "—"}</em>
              </span>
            );
          })}
        </div>

        {offlineVenues.length > 0 && (
          <p className="arb-notice">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {offlineVenues.map((v) => v.label).join(", ")} did not respond, so{" "}
              {offlineVenues.length === 1 ? "its prices are" : "their prices are"} missing from every
              row below.
            </span>
          </p>
        )}

        <section className="card data-table-card">
          <div className="data-toolbar arb-toolbar">
            <div className="data-search">
              <Search className="data-search__icon" aria-hidden="true" />
              <input
                className="input data-search__input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search market"
                aria-label="Search arb market"
              />
              {search && (
                <button type="button" className="data-search__clear" onClick={() => setSearch("")} aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="arb-filters">
              {GAP_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`btn btn-sm ${minBps === filter.value ? "btn-active" : ""}`}
                  onClick={() => setMinBps(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
              <span className="arb-seg" role="group" aria-label="Price column mode">
                <button
                  type="button"
                  className={`btn btn-sm ${priceMode === "dev" ? "btn-active" : ""}`}
                  onClick={() => setPriceMode("dev")}
                  title="Show each venue as bps away from the consensus price"
                >
                  vs consensus
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${priceMode === "abs" ? "btn-active" : ""}`}
                  onClick={() => setPriceMode("abs")}
                  title="Show each venue as an absolute price"
                >
                  prices
                </button>
              </span>
              <label className="arb-toggle" title="Hide rows with only 2 venues or an implausible gap">
                <input
                  type="checkbox"
                  checked={hideWeak}
                  onChange={(e) => setHideWeak(e.target.checked)}
                />
                Trustworthy only
              </label>
              <label className="arb-toggle">
                <input
                  type="checkbox"
                  checked={lighterOnly}
                  onChange={(e) => setLighterOnly(e.target.checked)}
                />
                Lighter listed
              </label>
            </div>
            <p className="data-toolbar__meta">{rows.length} opps</p>
          </div>

          {loading && !snapshot ? (
            <LoadingState variant="card" label="Scanning venue prices…" minHeight={360} />
          ) : (
            <TableScrollZone>
              <table className="data-table arb-table">
                <thead>
                  <tr>
                    <th className="data-table__rank">#</th>
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("symbol")}>
                        Market <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                    {priceMode === "dev" && <th className="arb-th-px">Consensus</th>}
                    {VENUES.map((venue) => (
                      <th key={venue.id} className="arb-th-px" title={`${venue.label} · ~${venue.takerBps} bps taker`}>
                        {venue.short}
                      </th>
                    ))}
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("gap")}>
                        Gap <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                    <th>
                      <button type="button" className="data-sort" onClick={() => toggleSort("net")}>
                        Net <ArrowUpDown className="data-sort__icon" />
                      </button>
                    </th>
                    <th>Route</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const barPct = maxGap > 0 ? Math.min(100, (row.gapBps / maxGap) * 100) : 0;
                    return (
                      <tr key={row.base} className={row.netBps > 0 && row.confidence === "high" ? "arb-row--hot" : ""}>
                        <td className="data-table__rank">{index + 1}</td>
                        <td>
                          <div className="arb-market">
                            <span className="arb-market__sym">{row.display}</span>
                            <span className="arb-market__meta">
                              <i className={`arb-conf arb-conf--${row.confidence}`} title={confidenceLabel(row)} />
                              {row.venueCount} venues
                              {row.lighterVolume24h != null && row.lighterVolume24h > 0
                                ? ` · ${formatUsdCompact(row.lighterVolume24h)} 24h`
                                : ""}
                            </span>
                          </div>
                        </td>
                        {priceMode === "dev" && (
                          <td className="arb-px arb-px--ref">
                            {formatArbPrice(consensusDisplayPrice(row))}
                          </td>
                        )}
                        {VENUES.map((venue) => {
                          const quote = row.byVenue[venue.id];
                          if (!quote) {
                            return (
                              <td key={venue.id} className="arb-px arb-px--empty">
                                —
                              </td>
                            );
                          }
                          const cellClass = venueCellClass(row, venue.id);
                          if (priceMode === "abs") {
                            const px = displayPrice(row, quote);
                            return (
                              <td
                                key={venue.id}
                                className={`arb-px ${cellClass}`}
                                title={quote.nativeSymbol}
                              >
                                {px != null ? formatArbPrice(px) : "—"}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={venue.id}
                              className={`arb-px arb-dev ${cellClass}`}
                              title={`${quote.nativeSymbol} · ${formatArbPrice(displayPrice(row, quote) ?? 0)}`}
                            >
                              {formatSignedBps(quote.devBps)}
                            </td>
                          );
                        })}
                        <td>
                          <div className={`arb-gap ${gapTone(row.gapBps)}`}>
                            <strong>{formatBps(row.gapBps)}</strong>
                            <i className="arb-gap__bar" aria-hidden="true">
                              <b style={{ width: `${Math.max(6, barPct)}%` }} />
                            </i>
                          </div>
                        </td>
                        <td>
                          <span className={`arb-net ${row.netBps > 0 ? "arb-net--pos" : "arb-net--neg"}`}>
                            {formatBps(row.netBps)}
                          </span>
                        </td>
                        <td>
                          <div className="arb-route">
                            <span className="arb-route__buy">Buy {VENUE_BY_ID[row.low.venue].short}</span>
                            <span className="arb-route__arrow" aria-hidden="true">
                              →
                            </span>
                            <span className="arb-route__sell">Sell {VENUE_BY_ID[row.high.venue].short}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={colSpan} className="py-12 text-center text-[#71717a]">
                        No gaps in this filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScrollZone>
          )}
        </section>

        <div className="arb-legend">
          <h2 className="arb-legend__title">How to read this</h2>
          <ul className="arb-legend__list">
            <li>
              <b>Consensus</b> is the median mark price across the venues that quote the asset.
              Each venue column shows how far that venue sits from it, in bps
              (<span className="arb-dev arb-px--low">−12</span> is cheap,{" "}
              <span className="arb-dev arb-px--high">+9</span> is rich). Switch to{" "}
              <b>prices</b> for absolute numbers.
            </li>
            <li>
              <b>Gap</b> is cheapest vs richest, pre-cost. <b>Net</b> takes off the estimated taker
              fee on both legs (Lighter 0, Aster ~3.5, HL ~4.5, Binance/OKX ~5, Bybit ~5.5, Bitget
              ~6 bps). Only a positive Net can pay, and it still ignores slippage, funding, and
              withdrawal time.
            </li>
            <li>
              The dot next to each market is confidence.{" "}
              <i className="arb-conf arb-conf--high" /> four or more venues quote it and the spread
              is shared between them; <i className="arb-conf arb-conf--medium" /> only three
              venues, or a clashing listing had to be dropped;{" "}
              <i className="arb-conf arb-conf--low" /> two venues only, an implausible gap, or the
              whole gap vanishes once one venue is removed — that venue is sitting on a stale mark
              and there is nothing to trade. Low rows are hidden unless you untick{" "}
              <b>Trustworthy only</b>; hover the dot for the reason.
            </li>
            <li>
              Contract sizes are normalised, so Binance <code>1000PEPEUSDT</code> and Lighter{" "}
              <code>PEPE</code> compare correctly. Listings that share a ticker but not an asset —
              Binance <code>CATUSDT</code> (Caterpillar) vs Bybit <code>1000CATUSDT</code> (the
              memecoin), or Lighter equity perps like <code>DIA</code> and <code>BB</code> — are
              excluded instead of shown as enormous fake gaps.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function formatUpdated(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 2000) return "just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  return `${Math.round(delta / 60_000)}m ago`;
}
