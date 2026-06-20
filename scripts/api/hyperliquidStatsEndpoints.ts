/**
 * Endpoint paths from thunderhead-labs/hyperliquid-stats-web
 * @see https://github.com/thunderhead-labs/hyperliquid-stats-web/blob/main/constants/api.ts
 */
export const HYPERLIQUID_STATS_ENDPOINTS = {
  total_users: "/hyperliquid/total_users",
  total_usd_volume: "/hyperliquid/total_usd_volume",
  total_deposits: "/hyperliquid/total_deposits",
  total_withdrawals: "/hyperliquid/total_withdrawals",
  total_notional_liquidated: "/hyperliquid/total_notional_liquidated",
  cumulative_usd_volume: "/hyperliquid/cumulative_usd_volume",
  daily_usd_volume: "/hyperliquid/daily_usd_volume",
  daily_trades: "/hyperliquid/daily_trades",
  cumulative_trades: "/hyperliquid/cumulative_trades",
  daily_unique_users: "/hyperliquid/daily_unique_users",
  cumulative_users: "/hyperliquid/cumulative_users",
  open_interest: "/hyperliquid/open_interest",
  funding_rate: "/hyperliquid/funding_rate",
  cumulative_inflow: "/hyperliquid/cumulative_inflow",
  daily_inflow: "/hyperliquid/daily_inflow",
} as const;

export type HyperliquidStatsEndpoint = keyof typeof HYPERLIQUID_STATS_ENDPOINTS;