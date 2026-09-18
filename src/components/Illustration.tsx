/**
 * Spot illustrations for the empty, offline and failure states. Drawn from
 * the same CHAOS -> DROP -> ORGANIZED idea as the mark: loose material above,
 * settled bars below. No raster assets, so they theme themselves.
 */

export type Art = 'inbox' | 'vault' | 'search' | 'offline' | 'unreadable' | 'nothing'

export function Illustration({ art, size = 132 }: { art: Art; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="46" fill="var(--primary-soft)" />
      {art === 'inbox' && (
        <>
          <rect x="30" y="52" width="60" height="38" rx="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
          <path d="M30 66h13l4 7h26l4-7h13" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 22c0 0 12 12.6 12 21a12 12 0 1 1-24 0c0-8.4 12-21 12-21Z" fill="var(--primary)" opacity=".9" />
        </>
      )}
      {art === 'vault' && (
        <>
          <rect x="32" y="34" width="56" height="52" rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
          <circle cx="60" cy="58" r="10" stroke="var(--primary)" strokeWidth="2.4" />
          <path d="M60 68v8" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {art === 'search' && (
        <>
          <circle cx="54" cy="54" r="19" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.6" />
          <path d="M68 68 84 84" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
          <path d="M46 50h16M46 58h10" stroke="var(--border)" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {art === 'offline' && (
        <g className="anim-breathe">
          <path d="M28 50a44 44 0 0 1 64 0" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" />
          <path d="M40 63a28 28 0 0 1 40 0" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" />
          <path d="M51 75a13 13 0 0 1 18 0" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="60" cy="86" r="3" fill="var(--muted)" />
          <path d="M34 34 88 88" stroke="var(--danger)" strokeWidth="3.2" strokeLinecap="round" />
        </g>
      )}
      {art === 'unreadable' && (
        <>
          <rect x="38" y="32" width="44" height="56" rx="9" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
          <path d="M48 48h24M48 58h24M48 68h14" stroke="var(--border)" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="82" cy="80" r="14" fill="var(--warning)" />
          <path d="M82 74v6M82 85h.01" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {art === 'nothing' && (
        <>
          <rect x="32" y="46" width="56" height="12" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
          <rect x="32" y="66" width="40" height="12" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
        </>
      )}
    </svg>
  )
}
