import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "./LoadingState";
import { ChartDownloadButton } from "./ChartDownloadButton";
import { chartDownloadFilename } from "../lib/chartDownload";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { formatUSD, formatNumber } from "../lib/api";
import {
  fetchLitStakingPool,
  fetchLitSupplyBreakdown,
  formatLitAmount,
  formatLockup,
  type LitStakingSnapshot,
  type LitSupplyBreakdown,
  type LitSupplySegment,
} from "../lib/stakingPool";
import { formatApy } from "../lib/llpHlp";
import { LIGHTER_COLOR } from "./compare/shared";

const REFRESH_MS = 60_000;

function SupplyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: LitSupplySegment }>;
}) {
  if (!active || !payload?.length) return null;
  const segment = payload[0]?.payload;
  if (!segment) return null;
  return (
    <div className="compare-tooltip">
      <p className="compare-tooltip__label">{segment.label}</p>
      <p className="compare-tooltip__row" style={{ color: segment.color }}>
        <span>Amount</span>
        <span className="compare-tooltip__value">{formatLitAmount(segment.value)} LIT</span>
      </p>
      <p className="compare-tooltip__row" style={{ color: segment.color }}>
        <span>% of circulating</span>
        <span className="compare-tooltip__value">{segment.pct.toFixed(2)}%</span>
      </p>
    </div>
  );
}

function LitSupplyChart({ supply }: { supply: LitSupplyBreakdown }) {
  const captureRef = useRef<HTMLElement>(null);
  const barData = useMemo(
    () => [
      {
        label: "Circulating",
        staked: supply.stakedLit,
        buyback: supply.totalBuybackLit,
        inTrading: supply.inTrading,
      },
    ],
    [supply]
  );

  return (
    <article ref={captureRef} className="staking-supply-card downloadable-block">
      <ChartDownloadButton
        targetRef={captureRef}
        filename={chartDownloadFilename("lit-supply")}
        className="downloadable-block__dl"
      />
      <header className="staking-supply-card__head">
        <div>
          <h4 className="staking-supply-card__title">LIT supply</h4>
        </div>
        <div className="staking-supply-card__totals">
          <div>
            <span className="staking-supply-card__total-label">Circulating</span>
            <span className="staking-supply-card__total-value">
              {formatLitAmount(supply.circulatingSupply)} LIT
            </span>
          </div>
          <div>
            <span className="staking-supply-card__total-label">Out of trading</span>
            <span className="staking-supply-card__total-value staking-supply-card__total-value--muted">
              {formatLitAmount(supply.outOfTrading)} LIT
              <em>{supply.outOfTradingPct.toFixed(1)}%</em>
            </span>
          </div>
          <div>
            <span className="staking-supply-card__total-label">In trading</span>
            <span className="staking-supply-card__total-value staking-supply-card__total-value--green">
              {formatLitAmount(supply.inTrading)} LIT
              <em>{supply.inTradingPct.toFixed(1)}%</em>
            </span>
          </div>
        </div>
      </header>

      <div className="staking-supply-charts">
        <div className="staking-supply-donut">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={supply.segments}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {supply.segments.map((segment) => (
                  <Cell key={segment.id} fill={segment.color} />
                ))}
              </Pie>
              <Tooltip content={<SupplyTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="staking-supply-donut__center">
            <span className="staking-supply-donut__pct">{supply.outOfTradingPct.toFixed(1)}%</span>
            <span className="staking-supply-donut__label">out of trading</span>
          </div>
        </div>

        <div className="staking-supply-bar-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
              barSize={42}
            >
              <CartesianGrid strokeDasharray="2 2" stroke="#24263a" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#71717a", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatLitAmount(Number(v))}
              />
              <YAxis type="category" dataKey="label" hide />
              <Tooltip
                formatter={(value, name) => [
                  `${formatLitAmount(Number(value ?? 0))} LIT`,
                  name === "staked" ? "Staked" : name === "buyback" ? "Buyback" : "In trading",
                ]}
                contentStyle={{
                  background: "#11131c",
                  border: "1px solid #24263a",
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="staked" stackId="supply" fill="#22d3ee" radius={[6, 0, 0, 6]} />
              <Bar dataKey="buyback" stackId="supply" fill="#fbbf24" />
              <Bar dataKey="inTrading" stackId="supply" fill="#4ade80" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ul className="staking-supply-legend">
        {supply.segments.map((segment) => (
          <li key={segment.id} className="staking-supply-legend__item">
            <span className="staking-supply-legend__dot" style={{ background: segment.color }} />
            <span className="staking-supply-legend__label">{segment.label}</span>
            <span className="staking-supply-legend__value">{formatLitAmount(segment.value)} LIT</span>
            <span className="staking-supply-legend__pct">{segment.pct.toFixed(2)}%</span>
          </li>
        ))}
      </ul>

    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="staking-metric">
      <span className="staking-metric__label">{label}</span>
      <span className={`staking-metric__value ${accent ? "staking-metric__value--accent" : ""}`}>
        {value}
      </span>
      {sub && <span className="staking-metric__sub">{sub}</span>}
    </div>
  );
}

export function StakingSection() {
  const [pool, setPool] = useState<LitStakingSnapshot | null>(null);
  const [supply, setSupply] = useState<LitSupplyBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const poolRef = useRef<HTMLElement>(null);
  const assetsRef = useRef<HTMLElement>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const poolData = await fetchLitStakingPool();
      setPool(poolData);
      setSupply(await fetchLitSupplyBreakdown(poolData.stakedLit));
    } catch (err: unknown) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Failed to load staking pool";
        toast.error(message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="staking-section">
      <article ref={poolRef} className="staking-pool-card downloadable-block">
        <ChartDownloadButton
          targetRef={poolRef}
          filename={chartDownloadFilename("lit-staking")}
          className="downloadable-block__dl"
        />
        <header className="staking-pool-card__head">
          <span className="staking-pool-card__badge" style={{ background: LIGHTER_COLOR }}>
            LIT
          </span>
          <div>
            <h3 className="staking-pool-card__title">LIT Staking</h3>
          </div>
        </header>

        {loading && !pool ? (
          <LoadingState label="Loading staking pool…" />
        ) : pool ? (
          <>
            <div className="staking-hero">
              <div className="staking-hero__primary">
                <span className="staking-hero__label">Total staked LIT</span>
                <span className="staking-hero__value">{formatLitAmount(pool.stakedLit)} LIT</span>
                <span className="staking-hero__usd">{formatUSD(pool.usdValue, true)}</span>
              </div>
              <div className="staking-hero__stats">
                <Metric label="APY" value={formatApy(pool.apy)} />
                <Metric label="Lockup" value={formatLockup(pool.lockupMs)} />
                <Metric label="Operator fee" value={`${pool.operatorFee.toFixed(2)}%`} />
              </div>
            </div>

            <div className="staking-metrics-grid">
              <Metric label="Pool account index" value={formatNumber(pool.accountIndex)} />
              <Metric label="Master account" value={String(pool.masterAccountIndex)} />
              <Metric label="Total shares" value={formatNumber(pool.totalShares, true)} />
              <Metric
                label="LIT per share"
                value={pool.litPerShare > 0 ? pool.litPerShare.toExponential(4) : "—"}
              />
              <Metric
                label="Pool created"
                value={new Date(pool.createdAt * 1000).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              />
              <Metric
                label="Spot USD value"
                value={formatUSD(pool.usdValue, true)}
                accent
              />
            </div>
          </>
        ) : null}
      </article>

      {supply && <LitSupplyChart supply={supply} />}

      {pool?.assets.length ? (
        <article ref={assetsRef} className="card w-full min-w-0 downloadable-block relative">
          <ChartDownloadButton
            targetRef={assetsRef}
            filename={chartDownloadFilename("lit-staking-assets")}
            className="downloadable-block__dl"
          />
          <header className="staking-assets-head">
            <h4 className="staking-assets-head__title">Assets</h4>
          </header>
          <div className="table-scroll">
          <table className="w-full text-sm market-table asset-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Locked</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {pool.assets.map((asset) => (
                <tr key={asset.asset_id}>
                  <td className="font-medium text-[#f4f4f5]">{asset.symbol}</td>
                  <td className="text-right tabular-nums">
                    {asset.symbol === "LIT"
                      ? `${formatLitAmount(parseFloat(asset.balance))} LIT`
                      : formatUSD(parseFloat(asset.balance), true)}
                  </td>
                  <td className="text-right tabular-nums text-[#71717a]">
                    {formatLitAmount(parseFloat(asset.locked_balance))}
                  </td>
                  <td className="text-right tabular-nums text-[#71717a]">
                    {formatLitAmount(parseFloat(asset.margin_balance))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </article>
      ) : null}

      <article className="staking-soon card p-5 sm:p-6">
        <h4 className="staking-soon__title">HYPE staking — coming soon</h4>
      </article>
    </div>
  );
}