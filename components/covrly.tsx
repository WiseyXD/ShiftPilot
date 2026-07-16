import * as React from "react"

// Covrly — the brand mascot from the design deck (covrly2.svg): a brand-green
// "C" ring hugging a mint face, closing on a check badge — every shift covered.
// Pure inline SVG so it's crisp at any size and never a network request.
// Calm by design: it guides and reacts, it never pops up on its own.

interface CovrlyProps {
  size?: number
  wave?: boolean
  className?: string
  title?: string
}

// Deck palette
const RING_LIGHT = "#12857a"
const RING_DARK = "#0e5f56"
const MINT = "#8fd6c9"
const WARM_WHITE = "#fffcf7"
const INK = "#1b1a17"

export function Covrly({ size = 96, wave = false, className, title = "Covrly" }: CovrlyProps) {
  // Unique gradient id — the mascot renders several times per page
  const gradientId = React.useId()

  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="0 0 200 220"
      fill="none"
      role="img"
      aria-label={title}
      className={[wave ? "covrly-wave" : null, className].filter(Boolean).join(" ") || undefined}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={RING_LIGHT} />
          <stop offset="1" stopColor={RING_DARK} />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="100" cy="205" rx="58" ry="9" fill={INK} opacity="0.08" />

      {/* the C ring */}
      <path
        d="M 152 78 A 62 62 0 1 0 152 162"
        stroke={`url(#${gradientId})`}
        strokeWidth="44"
        fill="none"
        strokeLinecap="round"
      />

      {/* face */}
      <circle cx="100" cy="120" r="42" fill={MINT} />
      <circle cx="86" cy="112" r="9" fill={WARM_WHITE} />
      <circle cx="116" cy="112" r="9" fill={WARM_WHITE} />
      <circle cx="88" cy="113" r="4.5" fill={INK} />
      <circle cx="118" cy="113" r="4.5" fill={INK} />
      <path
        d="M 90 138 Q 101 148 112 138"
        stroke={RING_DARK}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />

      {/* check badge — the C closes on a "covered" tick */}
      <circle cx="152" cy="78" r="14" fill={MINT} />
      <path
        d="M 147 78 l 4 4 l 7 -7"
        stroke={RING_DARK}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
