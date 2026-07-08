import * as React from "react"

// Covrly — the brand mascot. A friendly café cup who "covers" your shifts.
// Pure inline SVG so it's crisp at any size, themeable, and never a network
// request. Calm by design: it guides and reacts, it never pops up on its own.

interface CovrlyProps {
  size?: number
  wave?: boolean
  className?: string
  title?: string
}

const CREAM = "#F4EAD8"
const ESPRESSO = "#3B2A20"
const TERRA = "#C9724A"
const COFFEE = "#4A2E20"

export function Covrly({ size = 96, wave = false, className, title = "Covrly" }: CovrlyProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* steam */}
      <g stroke={ESPRESSO} strokeWidth={2.4} strokeLinecap="round" opacity={0.28} fill="none">
        <path d="M43 26 q-4 -5 0 -10 q4 -5 0 -10" />
        <path d="M57 26 q4 -5 0 -10 q-4 -5 0 -10" />
      </g>

      {/* saucer */}
      <ellipse cx="50" cy="90" rx="30" ry="5.5" fill={ESPRESSO} opacity={0.12} />

      {/* handle */}
      <path
        d="M72 50 q15 1 15 15 q0 13 -15 13"
        stroke={ESPRESSO}
        strokeWidth={5.5}
        fill="none"
        strokeLinecap="round"
      />

      {/* cup body */}
      <path
        d="M27 37 L73 37 L68 80 Q67 88 58 88 L42 88 Q33 88 32 80 Z"
        fill={CREAM}
        stroke={ESPRESSO}
        strokeWidth={3}
        strokeLinejoin="round"
      />

      {/* terracotta sleeve */}
      <path d="M30.5 58 L69.5 58 L67.8 70 L32.2 70 Z" fill={TERRA} opacity={0.92} />
      <path
        d="M30.5 58 L69.5 58 M32.2 70 L67.8 70"
        stroke={ESPRESSO}
        strokeWidth={1.4}
        opacity={0.25}
      />

      {/* coffee surface */}
      <ellipse cx="50" cy="37" rx="23" ry="6" fill={CREAM} stroke={ESPRESSO} strokeWidth={3} />
      <ellipse cx="50" cy="37" rx="17" ry="4" fill={COFFEE} />

      {/* face */}
      <g>
        <circle cx="43" cy="50" r="3.4" fill={ESPRESSO} />
        <circle cx="57" cy="50" r="3.4" fill={ESPRESSO} />
        <circle cx="44.1" cy="48.9" r="1" fill="#fff" />
        <circle cx="58.1" cy="48.9" r="1" fill="#fff" />
        <circle cx="39" cy="54" r="2.6" fill={TERRA} opacity={0.45} />
        <circle cx="61" cy="54" r="2.6" fill={TERRA} opacity={0.45} />
        <path
          d="M45 54 Q50 58.5 55 54"
          stroke={ESPRESSO}
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* waving arm */}
      {wave && (
        <g stroke={TERRA} strokeWidth={5} strokeLinecap="round" fill={TERRA}>
          <path d="M28 62 q-11 -1 -15 -13" fill="none" />
          <circle cx="12" cy="47" r="4.5" stroke="none" />
        </g>
      )}
    </svg>
  )
}
