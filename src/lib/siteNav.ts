import type { SiteView } from '../components/SiteNav';
import { isCompareHash } from './compareNav';

const LEGACY_SUPPORT_HASHES = ['#donation', '#trade'] as const;

function isLegacySupportHash(hash: string): boolean {
  return LEGACY_SUPPORT_HASHES.some(
    (legacy) => hash === legacy || hash.startsWith(`${legacy}/`),
  );
}

export function normalizeSupportHash(hash = window.location.hash): void {
  if (!isLegacySupportHash(hash)) return;
  const next = '#support';
  if (window.location.hash !== next) {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${next}`,
    );
  }
}

export function getSiteViewFromHash(hash = window.location.hash): SiteView {
  if (hash === '#support' || hash.startsWith('#support/') || isLegacySupportHash(hash)) {
    return 'support';
  }
  if (isCompareHash(hash)) return 'compare';
  return 'dashboard';
}

export function siteViewHash(view: SiteView): string {
  if (view === 'compare') return '#compare/book-depth';
  if (view === 'support') return '#support';
  return '';
}