export type LoadingVariant = "inline" | "card" | "chart" | "table" | "page";

const CHART_BAR_HEIGHTS = [38, 62, 48, 74, 42, 68, 52, 70, 44, 58, 66, 50];

interface LoadingStateProps {
  label?: string;
  variant?: LoadingVariant;
  className?: string;
  minHeight?: number | string;
  rows?: number;
}

export function LoadingState({
  label = "Loading…",
  variant = "card",
  className = "",
  minHeight,
  rows = 6,
}: LoadingStateProps) {
  const style = minHeight != null ? { minHeight } : undefined;

  if (variant === "inline") {
    return (
      <span
        className={`loading-state loading-state--inline ${className}`.trim()}
        role="status"
        aria-live="polite"
      >
        <span className="loading-state__spinner" aria-hidden="true" />
        <span className="loading-state__label">{label}</span>
      </span>
    );
  }

  if (variant === "table") {
    return (
      <>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="loading-state__tr" aria-hidden="true">
            <td>
              <span className="loading-state__cell loading-state__cell--wide" />
            </td>
            <td>
              <span className="loading-state__cell loading-state__cell--md loading-state__cell--end" />
            </td>
            <td>
              <span className="loading-state__cell loading-state__cell--md loading-state__cell--end" />
            </td>
            <td>
              <span className="loading-state__cell loading-state__cell--sm loading-state__cell--end" />
            </td>
            <td>
              <span className="loading-state__cell loading-state__cell--xs loading-state__cell--end" />
            </td>
          </tr>
        ))}

      </>
    );
  }

  if (variant === "chart") {
    return (
      <div
        className={`loading-state loading-state--chart ${className}`.trim()}
        style={style}
        role="status"
        aria-live="polite"
      >
        <div className="loading-state__chart-bars" aria-hidden="true">
          {CHART_BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className="loading-state__chart-bar"
              style={{ height: `${h}%`, animationDelay: `${i * 0.07}s` }}
            />
          ))}
        </div>
        <div className="loading-state__overlay">
          <span className="loading-state__spinner loading-state__spinner--lg" aria-hidden="true" />
          <span className="loading-state__label">{label}</span>
        </div>
      </div>
    );
  }

  const cardClass =
    variant === "page" ? "loading-state--page" : "loading-state--card";

  return (
    <div
      className={`loading-state ${cardClass} ${className}`.trim()}
      style={style}
      role="status"
      aria-live="polite"
    >
      <span className="loading-state__spinner loading-state__spinner--lg" aria-hidden="true" />
      <span className="loading-state__label">{label}</span>
      <span className="loading-state__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}