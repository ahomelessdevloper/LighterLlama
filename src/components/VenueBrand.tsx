export type VenueId = "lighter" | "hyperliquid";

export const VENUES: Record<
  VenueId,
  { id: VenueId; name: string; color: string; logo: string }
> = {
  lighter: {
    id: "lighter",
    name: "Lighter",
    color: "#22d3ee",
    logo: "/venues/lighter.png",
  },
  hyperliquid: {
    id: "hyperliquid",
    name: "Hyperliquid",
    color: "#4ade80",
    logo: "/venues/hyperliquid.png",
  },
};

const LOGO_PX = { xs: 14, sm: 18, md: 22, lg: 28 } as const;

export type VenueLogoSize = keyof typeof LOGO_PX;

export function VenueLogo({
  venue,
  size = "md",
  className = "",
}: {
  venue: VenueId;
  size?: VenueLogoSize;
  className?: string;
}) {
  const px = LOGO_PX[size];
  const { logo, name } = VENUES[venue];
  return (
    <img
      src={logo}
      alt=""
      width={px}
      height={px}
      className={`venue-logo venue-logo--${venue} venue-logo--${size} ${className}`.trim()}
      aria-hidden="true"
      title={name}
    />
  );
}

export function VenueDuel({
  showNames = true,
  size = "sm",
  className = "",
}: {
  showNames?: boolean;
  size?: VenueLogoSize;
  className?: string;
}) {
  return (
    <div className={`venue-duel ${className}`.trim()} aria-label="Lighter vs Hyperliquid">
      <span className="venue-duel__side venue-duel__side--lighter">
        <VenueLogo venue="lighter" size={size} />
        {showNames && <span className="venue-duel__name">{VENUES.lighter.name}</span>}
      </span>
      <span className="venue-duel__vs">vs</span>
      <span className="venue-duel__side venue-duel__side--hyperliquid">
        <VenueLogo venue="hyperliquid" size={size} />
        {showNames && <span className="venue-duel__name">{VENUES.hyperliquid.name}</span>}
      </span>
    </div>
  );
}

export function VenueLegendItem({ venue }: { venue: VenueId }) {
  return (
    <span className={`venue-legend venue-legend--${venue}`}>
      <VenueLogo venue={venue} size="xs" />
      <span>{VENUES[venue].name}</span>
    </span>
  );
}

export function venueDisplayName(id: VenueId | string | undefined): string {
  if (id === "lighter" || id === "L") return VENUES.lighter.name;
  if (id === "hyperliquid" || id === "H") return VENUES.hyperliquid.name;
  return id ?? "—";
}