import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DropCard } from '../components/DropCard'
import { EmptyState, OfflineBanner } from '../components/States'
import { InstallBanner } from '../components/InstallApp'
import { Icon } from '../components/Icon'
import { ThemeToggle } from '../components/ThemeToggle'
import { Button, SectionHead } from '../components/UI'
import {
  monthSpend,
  needsReviewDrops,
  recentDrops,
  todayDrops,
  upcomingDrops,
  useApp,
} from '../lib/store'
import { formatTime, peso } from '../lib/format'
import type { Drop } from '../lib/types'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The Life Pulse line — what actually needs the user today, in plain words. */
function pulse(today: Drop[], upcoming: Drop[], review: Drop[]): string {
  if (today.length) {
    const due = today.filter((d) => d.category === 'bill')
    if (due.length === 1) return `${due[0].title} from ${due[0].merchant} is due today.`
    if (due.length > 1) return `${due.length} bills are due today.`
    return `${today[0].title} is today${today[0].time ? ` at ${formatTime(today[0].time)}` : ''}.`
  }
  if (review.length)
    return `${review.length} drop${review.length > 1 ? 's' : ''} waiting for your review.`
  if (upcoming.length) {
    const next = upcoming[0]
    return `Next up: ${next.title}${next.merchant ? ` from ${next.merchant}` : ''}.`
  }
  return 'Nothing needs you right now. Drop something and it gets filed.'
}

export function Home({ onDrop }: { onDrop: () => void }) {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const name = useApp((s) => s.settings.name)
  const online = useApp((s) => s.online)
  const loadSamples = useApp((s) => s.loadSamples)
  const clearSamples = useApp((s) => s.clearSamples)
  const showToast = useApp((s) => s.showToast)

  const today = useMemo(() => todayDrops(drops), [drops])
  const upcoming = useMemo(() => upcomingDrops(drops), [drops])
  const recent = useMemo(() => recentDrops(drops, 5), [drops])
  const review = useMemo(() => needsReviewDrops(drops), [drops])

  const now = new Date()
  const spend = useMemo(() => monthSpend(drops, now.getFullYear(), now.getMonth()), [drops])
  const firstName = name.trim().split(' ')[0]
  const empty = drops.length === 0

  return (
    <div className="screen">
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="caption">{greeting()}</div>
          {firstName ? (
            <h1 style={{ marginTop: 1 }}>{firstName}</h1>
          ) : (
            // No invented name — ask for one instead.
            <button
              onClick={() => navigate('/setup?edit=1')}
              style={{
                marginTop: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'Manrope, sans-serif',
                fontWeight: 800,
                fontSize: 21,
                letterSpacing: '-.6px',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                color: 'var(--primary-ink)',
              }}
            >
              Add your name
              <Icon name="chev" size={16} width={2.4} />
            </button>
          )}
        </div>
        <ThemeToggle />
        <button className="iconbtn" onClick={() => navigate('/search')} aria-label="Search">
          <Icon name="search" size={20} />
        </button>
        <button
          className="iconbtn"
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
          style={{ position: 'relative' }}
        >
          <Icon name="bell" size={20} />
          {(today.length > 0 || review.length > 0) && (
            <i
              style={{
                position: 'absolute',
                top: 9,
                right: 10,
                width: 7,
                height: 7,
                borderRadius: 999,
                background: 'var(--danger)',
              }}
            />
          )}
        </button>
      </header>

      <div className="scrollhost nsb">
        {!online && <OfflineBanner />}
        <InstallBanner />

        {empty ? (
          // A first run shows one thing to do, not a dashboard of zeroes.
          <EmptyState
            art="nothing"
            title="Nothing dropped yet"
            body="Drop a bill, receipt, booking or screenshot. LifeDrop reads it, files it, and reminds you before the date arrives."
            action={
              <>
                <Button
                  onClick={onDrop}
                  style={{ width: 'auto', padding: '14px 24px' }}
                  icon="plus"
                >
                  Drop your first thing
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await loadSamples()
                    showToast('Sample vault loaded', {
                      label: 'Remove',
                      run: () => void clearSamples(),
                    })
                  }}
                >
                  Or look around with sample data
                </Button>
              </>
            }
          />
        ) : (
          <>
            <div className="gradcard">
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.6,
                    textTransform: 'uppercase',
                    opacity: 0.8,
                  }}
                >
                  Life Pulse
                </div>
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 15.5,
                    lineHeight: 1.5,
                    fontWeight: 600,
                    maxWidth: 260,
                  }}
                >
                  {pulse(today, upcoming, review)}
                </p>
                <div style={{ display: 'flex', gap: 22, marginTop: 16 }}>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>
                      {today.length}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.82, fontWeight: 600 }}>Today</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>
                      {upcoming.length}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.82, fontWeight: 600 }}>Upcoming</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>
                      {peso(spend)}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.82, fontWeight: 600 }}>This month</div>
                  </div>
                </div>
              </div>
            </div>

            {review.length > 0 && (
              <button
                className="card"
                onClick={() => navigate('/inbox?filter=review')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  marginTop: 14,
                }}
              >
                <span
                  className="tile sm"
                  style={{
                    background: 'color-mix(in srgb, var(--warning) var(--tint), transparent)',
                  }}
                >
                  <Icon name="alert" size={17} color="var(--warning)" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
                    {review.length} drop{review.length > 1 ? 's' : ''} need a look
                  </span>
                  <span className="caption">LifeDrop was unsure about a few details</span>
                </span>
                <Icon name="chev" size={17} color="var(--muted)" />
              </button>
            )}

            {today.length > 0 && (
              <>
                <SectionHead label="Today" />
                {today.map((d, i) => (
                  <div key={d.id} style={{ marginBottom: 10 }}>
                    <DropCard drop={d} index={i} />
                  </div>
                ))}
              </>
            )}

            {upcoming.length > 0 && (
              <>
                <SectionHead
                  label="Upcoming"
                  action="Calendar"
                  onAction={() => navigate('/calendar')}
                />
                {upcoming.slice(0, 4).map((d, i) => (
                  <div key={d.id} style={{ marginBottom: 10 }}>
                    <DropCard drop={d} index={i} />
                  </div>
                ))}
              </>
            )}

            <SectionHead label="Recent drops" action="Vault" onAction={() => navigate('/vault')} />
            {recent.map((d, i) => (
              <div key={d.id} style={{ marginBottom: 10 }}>
                <DropCard drop={d} index={i} />
              </div>
            ))}

            <div className="grid2" style={{ marginTop: 18 }}>
              <button
                className="card"
                onClick={() => navigate('/spending')}
                style={{ textAlign: 'left' }}
              >
                <Icon name="peso" size={20} color="var(--accent-ink)" />
                <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>Spending</div>
                <div className="caption">This month: {peso(spend)}</div>
              </button>
              <button
                className="card"
                onClick={() => navigate('/subscriptions')}
                style={{ textAlign: 'left' }}
              >
                <Icon name="subscription" size={20} color="var(--violet)" />
                <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>Subscriptions</div>
                <div className="caption">
                  {drops.filter((d) => d.category === 'subscription' && !d.archived).length} active
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
