import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { CatChip, ReviewBadge, Tile } from './UI'
import type { Drop } from '../lib/types'
import { peso, trailingLabel, whenLine } from '../lib/format'

const TONE: Record<string, string> = {
  // The -ink variants: these are text, and the fill colours are too light to
  // read as small type on white. See tokens.css.
  danger: 'var(--danger-ink)',
  warning: 'var(--warning-ink)',
  info: 'var(--info-ink)',
  muted: 'var(--text2)',
  success: 'var(--success-ink)',
}

export function DropCard({
  drop,
  index = 0,
  showCategory = true,
  onClick,
}: {
  drop: Drop
  index?: number
  showCategory?: boolean
  onClick?: () => void
}) {
  const navigate = useNavigate()
  const trailing = trailingLabel(drop)

  return (
    <button
      className="dropcard"
      style={{ '--d': `${Math.min(index, 8) * 45}ms` } as React.CSSProperties}
      onClick={onClick ?? (() => navigate(`/item/${drop.id}`))}
    >
      <Tile category={drop.category} />
      <span className="mid">
        <span className="t">{drop.title}</span>
        <span className="s">{drop.merchant || whenLine(drop)}</span>
        <span className="meta">
          {showCategory && <CatChip category={drop.category} />}
          {drop.needsReview && <ReviewBadge />}
          {!drop.needsReview && <span className="caption">{whenLine(drop)}</span>}
        </span>
      </span>
      <span className="end">
        {drop.amount !== null && <span className="amt">{peso(drop.amount)}</span>}
        <span className="when" style={{ color: TONE[trailing.tone] }}>
          {trailing.label}
        </span>
      </span>
    </button>
  )
}

/**
 * Wraps a card in the swipe row from the motion spec: drag left past 34px to
 * reveal Remind and Archive, anything shorter snaps back.
 */
export function SwipeRow({
  drop,
  index,
  onRemind,
  onArchive,
}: {
  drop: Drop
  index: number
  onRemind: () => void
  onArchive: () => void
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const start = useRef<number | null>(null)
  const moved = useRef(false)

  return (
    <div className="swipe">
      <div className="swipe-actions" aria-hidden={!open}>
        <button
          className="remind"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setOpen(false)
            onRemind()
          }}
        >
          <Icon name="bell" size={18} color="#fff" width={1.9} />
          Remind
        </button>
        <button
          className="archive"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setOpen(false)
            onArchive()
          }}
        >
          <Icon name="inbox" size={18} color="#fff" width={1.9} />
          Archive
        </button>
      </div>
      <div
        className="swipe-face"
        style={{ transform: `translateX(${open ? -112 : 0}px)` }}
        onPointerDown={(e) => {
          start.current = e.clientX
          moved.current = false
        }}
        onPointerMove={(e) => {
          if (start.current !== null && Math.abs(e.clientX - start.current) > 8) moved.current = true
        }}
        onPointerUp={(e) => {
          if (start.current === null) return
          const dx = e.clientX - start.current
          start.current = null
          if (Math.abs(dx) > 34) setOpen(dx < 0)
        }}
      >
        <DropCard
          drop={drop}
          index={index}
          onClick={() => {
            if (moved.current) return
            if (open) {
              setOpen(false)
              return
            }
            navigate(`/item/${drop.id}`)
          }}
        />
      </div>
    </div>
  )
}
