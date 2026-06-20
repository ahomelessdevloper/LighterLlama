import { HeartHandshake, LayoutGrid, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND_ASSETS } from "../lib/brandAssets";

export type SiteView = "dashboard" | "compare" | "support";

interface SiteNavProps {
  active: SiteView;
  onNavigate: (view: SiteView) => void;
  actions?: ReactNode;
}

const TABS: Array<{
  id: SiteView;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "dashboard", label: "Stats", icon: LayoutGrid },
  { id: "compare", label: "Compare", icon: Scale },
  { id: "support", label: "Support", icon: HeartHandshake },
];

export function SiteNav({ active, onNavigate, actions }: SiteNavProps) {
  return (
    <header className="site-nav" data-view={active}>
      <div className="site-nav__beam" aria-hidden="true" />
      <div className="site-nav__mesh" aria-hidden="true" />

      <div className="site-nav__shell">
        <div className="site-nav__bar">
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
              height={30}
            />
          </button>

          <span className="site-nav__rule" aria-hidden="true" />

          <nav className="site-nav__dock" aria-label="Main">
            {TABS.map((tab) => {
              const isActive = active === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onNavigate(tab.id)}
                  className={`site-nav__link ${isActive ? "site-nav__link--active" : ""}`}
                >
                  <Icon className="site-nav__link-icon" aria-hidden="true" />
                  <span className="site-nav__link-label">{tab.label}</span>
                  {isActive && <span className="site-nav__link-glow" aria-hidden="true" />}
                </button>
              );
            })}
          </nav>

          <div className="site-nav__spacer" aria-hidden="true" />

          {actions && <div className="site-nav__actions">{actions}</div>}
        </div>
      </div>
    </header>
  );
}