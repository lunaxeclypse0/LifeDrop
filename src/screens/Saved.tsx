import { useNavigate, useParams } from 'react-router-dom'
import { DropCard } from '../components/DropCard'
import { Button } from '../components/UI'
import { Ripples } from '../components/Brand'
import { useApp } from '../lib/store'
import { fromISO, longDate, toISO, whenLine } from '../lib/format'

export function Saved() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const drop = useApp((s) => s.drops.find((d) => d.id === id))

  if (!drop) {
    navigate('/home', { replace: true })
    return null
  }

  // "We'll remind you on September 26." — the brand guide names the day rather
  // than making the reader do the arithmetic.
  let remindLine = 'No reminder set.'
  if (drop.remindDaysBefore !== null) {
    const when = fromISO(drop.date)
    when.setDate(when.getDate() - drop.remindDaysBefore)
    remindLine = `We'll remind you on ${longDate(toISO(when))}.`
  }

  return (
    <div className="screen">
      <div className="scrollhost no-nav" style={{ display: 'flex', flexDirection: 'column', paddingTop: 40 }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ position: 'relative', display: 'grid', placeItems: 'center', height: 130 }}>
              <Ripples size={140} color="var(--success)" />
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--success) var(--tint), transparent)',
                  display: 'grid',
                  placeItems: 'center',
                  animation: 'popScale 380ms var(--e-spring) both',
                  position: 'relative',
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12.6l4.6 4.6L19 7.4"
                    stroke="var(--success)"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 30,
                      strokeDashoffset: 30,
                      animation: 'strokeIn 520ms var(--e-out) 240ms forwards',
                    }}
                  />
                </svg>
              </div>
            </div>

            <h2 className="display" style={{ fontSize: 24, margin: '16px 0 8px' }}>
              Saved.
            </h2>
            <p className="body2" style={{ margin: '0 auto', maxWidth: 280, fontSize: 14.5 }}>
              {drop.title}
              {drop.merchant ? ` from ${drop.merchant}` : ''} is in your Inbox. {remindLine}
            </p>

            <div style={{ marginTop: 22, textAlign: 'left', animation: 'cardIn 340ms var(--e-out) 300ms both' }}>
              <DropCard drop={drop} onClick={() => navigate(`/item/${drop.id}`)} />
            </div>

            <p className="caption" style={{ marginTop: 10 }}>
              Filed under {whenLine(drop)}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 26 }}>
          <Button onClick={() => navigate(`/item/${drop.id}`)}>View item</Button>
          <Button variant="secondary" onClick={() => navigate('/home', { replace: true })}>
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  )
}
