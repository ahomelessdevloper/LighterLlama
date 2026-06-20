import { useCallback, useState } from "react";
import {
  Activity,
  Check,
  Copy,
  ExternalLink,
  Heart,
  HeartHandshake,
  ScanQrCode,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { SiteNav, type SiteView } from "../components/SiteNav";
import {
  DONATION_ASSETS,
  DONATION_WALLET,
  TRADE_ASSETS,
  TRADE_URL,
} from "../lib/siteLinks";

interface SupportPageProps {
  onNavigate: (view: SiteView) => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function truncateWallet(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function SupportPage({ onNavigate }: SupportPageProps) {
  const [walletCopied, setWalletCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyWallet = useCallback(async () => {
    const ok = await copyText(DONATION_WALLET);
    if (ok) {
      setWalletCopied(true);
      toast.success("Wallet address copied");
      window.setTimeout(() => setWalletCopied(false), 2000);
    } else {
      toast.error("Could not copy address");
    }
  }, []);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyText(TRADE_URL);
    if (ok) {
      setLinkCopied(true);
      toast.success("Referral link copied");
      window.setTimeout(() => setLinkCopied(false), 2000);
    } else {
      toast.error("Could not copy link");
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0b12] text-white">
      <SiteNav active="support" onNavigate={onNavigate} />

      <main className="support-page max-w-[720px] mx-auto w-full min-w-0 px-4 sm:px-6 pt-6 sm:pt-10 pb-12 sm:pb-16">
        <header className="support-page__head">
          <span className="support-page__badge">
            <HeartHandshake className="support-page__badge-icon" aria-hidden="true" />
            Support
          </span>
          <h1 className="support-page__title">Help keep LighterLlama free</h1>
          <p className="support-page__lead">
            Send <strong>ETH</strong> or <strong>LIT</strong>, or trade on Lighter with our link.
          </p>
        </header>

        <section className="donation-panel" aria-labelledby="support-donate-heading">
          <div className="donation-panel__glow" aria-hidden="true" />

          <div className="donation-panel__hero">
            <img
              src={DONATION_ASSETS.hero}
              alt=""
              className="donation-panel__hero-img"
              width={480}
              height={320}
              aria-hidden="true"
            />
            <div className="donation-panel__hero-overlay" aria-hidden="true">
              <span className="donation-page__badge">
                <Heart className="donation-page__badge-icon" aria-hidden="true" />
                Donate
              </span>
              <p className="donation-panel__title">Send ETH or LIT</p>
              <p className="donation-panel__lead">
                Your support keeps stats, compare tools, and charts free for everyone.
              </p>
            </div>
          </div>

          <div className="donation-panel__body">
            <div className="donation-panel__intro">
              <span className="donation-page__badge">
                <Heart className="donation-page__badge-icon" aria-hidden="true" />
                Donate
              </span>
              <h2 id="support-donate-heading" className="donation-panel__title">
                Send ETH or LIT
              </h2>
              <p className="donation-panel__lead">
                Your support keeps stats, compare tools, and charts free for everyone.
              </p>
            </div>

            <div className="donation-tokens donation-tokens--panel" aria-label="Supported tokens">
              <article className="donation-tokens__item donation-tokens__item--eth">
                <span className="donation-tokens__icon donation-tokens__dot" aria-hidden="true" />
                <div className="donation-tokens__meta">
                  <span className="donation-tokens__symbol">$ETH</span>
                  <span className="donation-tokens__name">Ethereum</span>
                </div>
              </article>
              <article className="donation-tokens__item donation-tokens__item--lit">
                <img
                  src="/venues/lighter.png"
                  alt=""
                  className="donation-tokens__icon donation-tokens__logo"
                  aria-hidden="true"
                />
                <div className="donation-tokens__meta">
                  <span className="donation-tokens__symbol">$LIT</span>
                  <span className="donation-tokens__name">Lighter</span>
                </div>
              </article>
            </div>

            <div className="donation-pay card">
              <figure className="donation-qr">
                <img
                  src={DONATION_ASSETS.qr}
                  alt="QR code for donation wallet on Ethereum"
                  className="donation-qr__img"
                  width={220}
                  height={220}
                />
                <figcaption className="donation-qr__copy">
                  <span className="donation-qr__label">
                    <ScanQrCode className="donation-qr__icon" aria-hidden="true" />
                    Scan to send
                  </span>
                  <span className="donation-qr__hint">ETH or LIT on Ethereum</span>
                </figcaption>
              </figure>

              <div className="donation-pay__divider" aria-hidden="true" />

              <section className="donation-wallet donation-wallet--panel" aria-label="Wallet address">
                <p className="donation-wallet__label">Wallet address</p>
                <p className="donation-wallet__network">Ethereum mainnet only</p>

                <button
                  type="button"
                  onClick={handleCopyWallet}
                  className={`donation-wallet__vault ${walletCopied ? "donation-wallet__vault--copied" : ""}`}
                  aria-label={`Copy wallet address ${DONATION_WALLET}`}
                >
                  <code className="donation-wallet__address donation-wallet__address--short">
                    {truncateWallet(DONATION_WALLET)}
                  </code>
                  <code className="donation-wallet__address donation-wallet__address--full">
                    {DONATION_WALLET}
                  </code>
                  <span className="donation-wallet__vault-action">
                    {walletCopied ? (
                      <>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        Copy address
                      </>
                    )}
                  </span>
                </button>

                <p className="donation-wallet__hint">
                  Send only <strong>ETH</strong> or <strong>LIT</strong> on Ethereum. Double check the
                  address before sending.
                </p>
              </section>
            </div>
          </div>
        </section>

        <div className="support-page__divider" aria-hidden="true" />

        <section className="support-section support-section--trade" aria-labelledby="support-trade-heading">
          <div className="trade-hero card overflow-hidden">
            <img
              src={TRADE_ASSETS.hero}
              alt="Trade on Lighter"
              className="trade-hero__img w-full h-auto block"
              width={480}
              height={280}
            />
          </div>

          <div className="support-section__head">
            <span className="trade-page__badge">
              <TrendingUp className="trade-page__badge-icon" aria-hidden="true" />
              Trade
            </span>
            <h2 id="support-trade-heading" className="support-section__title">
              Trade with my link
            </h2>
            <p className="support-section__lead">
              Use our Lighter referral for perps and spot. It helps support LighterLlama.
            </p>
          </div>

          <section className="trade-brand card" aria-label="Lighter">
            <img src="/venues/lighter.png" alt="" className="trade-brand__logo" aria-hidden="true" />
            <div>
              <span className="trade-brand__name">Lighter</span>
              <span className="trade-brand__sub">Official app · referral AJEY</span>
            </div>
          </section>

          <section className="trade-link card" aria-label="Referral link">
            <p className="trade-link__label">My trade link</p>
            <div className="trade-link__row">
              <code className="trade-link__url">{TRADE_URL}</code>
              <button type="button" onClick={handleCopyLink} className="trade-link__copy btn btn-sm">
                {linkCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </section>

          <a
            href={TRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="trade-page__cta site-nav__cta"
          >
            <span className="site-nav__cta-shine" aria-hidden="true" />
            <Activity className="site-nav__cta-icon" aria-hidden="true" />
            <span className="site-nav__cta-label">Open Lighter and trade</span>
            <ExternalLink className="site-nav__cta-ext" aria-hidden="true" />
          </a>
        </section>

        <footer className="site-footer support-page__footer">
          <a href="https://x.com/intent/follow?screen_name=ajey_eth" target="_blank" rel="noopener noreferrer">
            @ajey_eth
          </a>
          <span className="site-footer__sep">·</span>
          <a href="https://github.com/ahomelessdevloper" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </footer>
      </main>
    </div>
  );
}