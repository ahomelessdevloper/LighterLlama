export type CompareTabId =
  | "book-depth"
  | "execution-cost"
  | "pe"
  | "llp-hlp"
  | "staking"
  | "users-positions"
  | "buybacks";

export interface CompareTab {
  id: CompareTabId;
  label: string;
  short: string;
  description: string;
}

export const COMPARE_TABS: CompareTab[] = [
  { id: "book-depth", label: "Book Depth", short: "Depth", description: "Live order book depth comparison" },
  { id: "execution-cost", label: "Execution Cost", short: "Exec Cost", description: "Slippage and taker fee comparison" },
  { id: "pe", label: "P/E", short: "P/E", description: "Valuation multiples and revenue ratios" },
  { id: "llp-hlp", label: "LLP/HLP", short: "LLP/HLP", description: "Liquidity pool performance" },
  { id: "staking", label: "Staking", short: "Staking", description: "LIT and HYPE staking trends" },
  { id: "users-positions", label: "Users/Positions", short: "Users", description: "DAUs, open positions, and users" },
  { id: "buybacks", label: "Buybacks", short: "Buybacks", description: "Protocol buyback activity" },
];

const TAB_IDS = new Set(COMPARE_TABS.map((t) => t.id));

export function isCompareTabId(value: string): value is CompareTabId {
  return TAB_IDS.has(value as CompareTabId);
}

export function getCompareTabFromHash(hash = window.location.hash): CompareTabId {
  const match = hash.match(/^#compare\/([a-z-]+)/);
  if (match && isCompareTabId(match[1])) return match[1];
  return "book-depth";
}

export function isCompareHash(hash = window.location.hash): boolean {
  return hash === "#compare" || hash.startsWith("#compare/");
}

export function compareTabHash(tab: CompareTabId): string {
  return `#compare/${tab}`;
}

export function navigateCompareTab(tab: CompareTabId): void {
  window.location.hash = compareTabHash(tab);
  window.scrollTo({ top: 0, behavior: "smooth" });
}