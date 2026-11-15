/**
 * Inline SVG illustrations for the home page. Fog + teal palette, sharp edges, 4:3 viewBox
 * (hero is 16:10). Amber appears once per picture, as a tiny accent.
 */

const INK = '#0B1F3A';
const FOG = '#EEF4FB';
const SURFACE = '#DFEAF6';
const LINE = '#AFC3DB';
const TEAL = '#2B4FC7';
const TEAL_DARK = '#0A3A63';
const TEAL_MID = '#19C3E8';
const TEAL_LIGHT = '#9BE7F5';
const AMBER = '#19C3E8';
const FONT = 'Roboto, system-ui, sans-serif';

type ArtProps = { className?: string };

export function FloodDeskArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-labelledby="art-desk-title art-desk-desc"
      className={className}
    >
      <title id="art-desk-title">Flood desk map</title>
      <desc id="art-desk-desc">
        A map with a pin on a river, teal water spreading onto low ground beside it, and a small
        severity label.
      </desc>
      <rect width="400" height="300" fill={FOG} />
      {/* map grid */}
      <g stroke={LINE} strokeWidth="1">
        {[60, 120, 180, 240].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} />
        ))}
        {[80, 160, 240, 320].map((x) => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2="300" />
        ))}
      </g>
      {/* water spreading: light teal flood, then channel */}
      <path
        d="M-10 200 C60 150 120 190 190 140 S330 70 410 40 L410 120 C330 150 250 210 190 220 S60 260 -10 270Z"
        fill={TEAL_LIGHT}
        opacity="0.55"
      />
      <path
        d="M-10 222 C60 182 120 214 190 168 S330 96 410 68 L410 90 C330 118 250 190 190 196 S60 244 -10 250Z"
        fill={TEAL_MID}
        opacity="0.8"
      />
      <path
        d="M-10 236 C60 198 120 226 190 182 S330 108 410 80"
        fill="none"
        stroke={TEAL}
        strokeWidth="9"
      />
      {/* click pin on the river */}
      <g transform="translate(190 182)">
        <circle r="16" fill={TEAL_DARK} opacity="0.15" />
        <path d="M0 0 L-10 -22 A12 12 0 1 1 10 -22 Z" fill={INK} />
        <circle cx="0" cy="-27" r="4" fill={FOG} />
      </g>
      {/* severity chip: the single amber accent */}
      <g>
        <rect x="266" y="236" width="112" height="32" fill={AMBER} />
        <text
          x="322"
          y="257"
          textAnchor="middle"
          fontFamily={FONT}
          fontSize="13"
          fontWeight="800"
          fill={INK}
        >
          WARNING
        </text>
      </g>
    </svg>
  );
}

function Person({
  x,
  y,
  initials,
  found,
}: {
  x: number;
  y: number;
  initials: string;
  found?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="104" height="112" fill="#ffffff" stroke={LINE} strokeWidth="1.5" />
      <rect y="0" width="104" height="5" fill={found ? TEAL : TEAL_MID} />
      <rect x="28" y="22" width="48" height="48" fill={SURFACE} />
      <text
        x="52"
        y="54"
        textAnchor="middle"
        fontFamily={FONT}
        fontSize="20"
        fontWeight="800"
        fill={INK}
      >
        {initials}
      </text>
      <rect x="14" y="82" width="76" height="8" fill={SURFACE} />
      <rect x="14" y="96" width="46" height="6" fill={SURFACE} />
      {found && (
        <g transform="translate(76 8)">
          <rect width="22" height="22" fill={TEAL} />
          <path d="M5 11.5 L9.5 16 L17 7" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
      )}
    </g>
  );
}

export function FindArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-labelledby="art-find-title art-find-desc"
      className={className}
    >
      <title id="art-find-title">Finding people</title>
      <desc id="art-find-desc">
        A search field above three person cards showing initials. One card has a check mark meaning
        found.
      </desc>
      <rect width="400" height="300" fill={FOG} />
      {/* search field */}
      <rect x="24" y="24" width="352" height="44" fill="#ffffff" stroke={TEAL} strokeWidth="2" />
      <circle cx="50" cy="46" r="8" fill="none" stroke={INK} strokeWidth="2.5" />
      <line x1="56" y1="52" x2="63" y2="59" stroke={INK} strokeWidth="2.5" />
      <rect x="76" y="41" width="120" height="10" fill={SURFACE} />
      <rect x="296" y="32" width="72" height="28" fill={TEAL} />
      {/* results */}
      <Person x={24} y={100} initials="A.R." />
      <Person x={148} y={100} initials="M.K." found />
      <Person x={272} y={100} initials="S.T." />
      <rect x="24" y="236" width="256" height="8" fill={SURFACE} />
      <rect x="24" y="254" width="168" height="8" fill={SURFACE} />
    </svg>
  );
}

export function SmsArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-labelledby="art-sms-title art-sms-desc"
      className={className}
    >
      <title id="art-sms-title">Offline Helpline</title>
      <desc id="art-sms-desc">
        A phone with a chat: the question SEARCH Ana and a reply bubble. The screen is labelled
        simulation.
      </desc>
      <rect width="400" height="300" fill={FOG} />
      {/* phone */}
      <rect x="120" y="14" width="160" height="276" fill={INK} />
      <rect x="130" y="34" width="140" height="236" fill="#ffffff" />
      <rect x="176" y="20" width="48" height="6" fill="#3A4F6B" />
      {/* simulation banner */}
      <rect x="130" y="34" width="140" height="22" fill={TEAL_DARK} />
      <text
        x="200"
        y="49"
        textAnchor="middle"
        fontFamily={FONT}
        fontSize="10"
        fontWeight="800"
        fill={TEAL_LIGHT}
        letterSpacing="1.5"
      >
        SIMULATION
      </text>
      {/* incoming (right, from the user) */}
      <rect x="170" y="74" width="92" height="30" fill={TEAL} />
      <text
        x="216"
        y="93"
        textAnchor="middle"
        fontFamily={FONT}
        fontSize="11"
        fontWeight="700"
        fill="#ffffff"
      >
        SEARCH Ana
      </text>
      {/* reply (left) */}
      <rect x="138" y="118" width="116" height="62" fill={SURFACE} />
      <rect x="148" y="130" width="92" height="7" fill={LINE} />
      <rect x="148" y="146" width="72" height="7" fill={LINE} />
      <rect x="148" y="162" width="56" height="7" fill={LINE} />
      {/* found tick as the single amber-free accent; amber dot for the unread marker */}
      <circle cx="262" cy="124" r="5" fill={AMBER} />
      {/* input */}
      <rect x="138" y="238" width="124" height="22" fill={FOG} stroke={LINE} />
    </svg>
  );
}

function House({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="22" width="48" height="36" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <path d="M-6 24 L24 2 L54 24Z" fill={INK} />
      <rect x="19" y="38" width="10" height="20" fill={SURFACE} stroke={INK} strokeWidth="1.5" />
    </g>
  );
}

export function GuideArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-labelledby="art-guide-title art-guide-desc"
      className={className}
    >
      <title id="art-guide-title">Before, during and after a flood</title>
      <desc id="art-guide-desc">
        Three panels. Before: a house and a ready bag. During: water rising with a path to high
        ground. After: the water going down and a checklist.
      </desc>
      <rect width="400" height="300" fill={FOG} />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={12 + i * 128}
          y="16"
          width="120"
          height="268"
          fill="#ffffff"
          stroke={LINE}
        />
      ))}
      {/* tab strips */}
      {['BEFORE', 'DURING', 'AFTER'].map((label, i) => (
        <g key={label}>
          <rect x={12 + i * 128} y="16" width="120" height="22" fill={TEAL_DARK} />
          <text
            x={72 + i * 128}
            y="31"
            textAnchor="middle"
            fontFamily={FONT}
            fontSize="10"
            fontWeight="800"
            fill={TEAL_LIGHT}
            letterSpacing="1.5"
          >
            {label}
          </text>
        </g>
      ))}
      {/* before: house + ready bag */}
      <House x={36} y={120} />
      <rect x="40" y="206" width="28" height="30" fill={TEAL} />
      <rect x="48" y="198" width="12" height="8" fill="none" stroke={TEAL} strokeWidth="2.5" />
      <rect x="22" y="250" width="92" height="6" fill={SURFACE} />
      {/* during: rising water, high ground, arrow */}
      <path d="M140 250 L140 150 L200 150 L240 100 L240 250Z" fill={SURFACE} />
      <path d="M140 226 H240 V262 H140Z" fill={TEAL_MID} opacity="0.85" />
      <path d="M140 208 H210 V226 H140Z" fill={TEAL_LIGHT} opacity="0.6" />
      <path d="M160 190 L196 160 L212 130" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M204 130 H214 V140" fill="none" stroke={INK} strokeWidth="3" />
      {/* after: checklist */}
      {[84, 130, 176].map((y) => (
        <g key={y}>
          <rect x="278" y={y} width="20" height="20" fill={TEAL} />
          <path
            d={`M282 ${y + 10} L287 ${y + 15} L295 ${y + 5}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.5"
          />
          <rect x="306" y={y + 4} width="56" height="8" fill={SURFACE} />
        </g>
      ))}
      <rect x="278" y="222" width="20" height="20" fill="none" stroke={LINE} strokeWidth="2" />
      <rect x="306" y="226" width="40" height="8" fill={SURFACE} />
      <circle cx="368" cy="62" r="5" fill={AMBER} />
    </svg>
  );
}

/** 16:10 hero picture: one river valley at three flows. */
export function HeroArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 480 300"
      role="img"
      aria-labelledby="art-hero-title art-hero-desc"
      className={className}
    >
      <title id="art-hero-title">A river valley at three flows</title>
      <desc id="art-hero-desc">
        The same valley cross-section: low ground beside the channel floods first, and a hollow
        behind a ridge stays dry.
      </desc>
      <rect width="480" height="300" fill={TEAL_DARK} />
      <path d="M0 150 H480 V300 H0Z" fill={TEAL_LIGHT} opacity="0.32" />
      <path d="M0 184 H480 V300 H0Z" fill={TEAL_MID} opacity="0.5" />
      <path d="M0 216 H480 V300 H0Z" fill={TEAL} opacity="0.85" />
      <path
        d="M0 80 L60 96 L120 134 L170 196 L205 240 L240 262 L275 240 L310 196 L350 156 L385 104 L405 90 L425 126 L450 142 L480 136 V300 H0Z"
        fill={SURFACE}
      />
      <path
        d="M0 80 L60 96 L120 134 L170 196 L205 240 L240 262 L275 240 L310 196 L350 156 L385 104 L405 90 L425 126 L450 142 L480 136"
        fill="none"
        stroke={INK}
        strokeWidth="2"
      />
    </svg>
  );
}
