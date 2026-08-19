import { Heart } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND_ASSETS } from "../lib/brandAssets";

export type SiteView = "dashboard" | "compare" | "data" | "support";

interface SiteNavProps {
  active: SiteView;
  onNavigate: (view: SiteView) => void;
  actions?: ReactNode;
}

const MAIN_TABS: Array<{
  id: Exclude<SiteView, "support">;
  label: string;
}> = [
  { id: "dashboard", label: "Stats" },
  { id: "compare", label: "Compare" },
  { id: "data", label: "Data" },
];

export function SiteNav({ active, onNavigate, actions }: SiteNavProps) {
  return (
    <header className="site-nav" data-view={active}>
      <div className="site-nav__shell">
        <div className="site-nav__bar">
          <div className="site-nav__col site-nav__col--start">
            <button
              type="button"
              onClick={() => onNavigate("dashboard")}
              className="site-nav__brand"
              aria-label="LighterLlama home"
            >
              <img
                src={BRAND_ASSETS.logoWordmark}
                alt="LighterLlama"
                className="site-nav__brand-wordmark"
                height={28}
              />
            </button>
          </div>

          <nav className="site-nav__col site-nav__col--center" aria-label="Main">
            <ul className="site-nav__menu">
              {MAIN_TABS.map((tab) => {
                const isActive = active === tab.id;
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onNavigate(tab.id)}
                      className={`site-nav__link ${isActive ? "site-nav__link--active" : ""}`}
                    >
                      <span className="site-nav__link-text">{tab.label}</span>
                      {isActive && (
                        <span className="site-nav__link-indicator" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="site-nav__col site-nav__col--end">
            <button
              type="button"
              aria-current={active === "support" ? "page" : undefined}
              onClick={() => onNavigate("support")}
              className={`site-nav__cta site-nav__cta--donate ${
                active === "support" ? "site-nav__cta--active" : ""
              }`}
            >
              <Heart className="site-nav__cta-icon" aria-hidden="true" />
              <span className="site-nav__cta-label">Donate</span>
            </button>
            {actions}
          </div>
        </div>
      </div>
    </header>
  );
}