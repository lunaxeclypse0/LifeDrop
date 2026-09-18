import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/States'
import { Button, SectionHead, Tile, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { liveDrops, monthlySubscriptionTotal, useApp } from '../lib/store'
import { daysUntil, peso, shortDate } from '../lib/format'

export function Subscriptions() {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const updateDrop = useApp((s) => s.updateDrop)
  const showToast = useApp((s) => s.showToast)

  const subs = useMemo(
    () =>
      liveDrops(drops)
        .filter((d) => d.category === 'subscription')
        .sort((a, b) => a.date.localeCompare(b.date)),
    [drops],
  )

  const active = subs.filter((d) => d.status === 'active')
  const monthly = monthlySubscriptionTotal(drops)

  return (
    <div className="screen">
      <TopBar title="Subscriptions" subtitle={`${active.length} active`} back />

      <div className="scrollhost no-nav">
        {subs.length === 0 ? (
          <EmptyState
            art="nothing"
            title="No subscriptions yet"
            body="Drop a renewal email or receipt and LifeDrop starts tracking the charge."
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
                    opacity: 0.82,
                  }}
                >
                  Every month
                </div>
                <div className="num" style={{ fontSize: 34, marginTop: 4, letterSpacing: '-1.4px' }}>
                  {peso(monthly)}
                </div>
                <div style={{ fontSize: 12.5, opacity: 0.86, marginTop: 2 }}>
                  {peso(monthly * 12)} a year across {active.length} subscription
                  {active.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            <SectionHead label="Renewing next" />
            {subs.map((d, i) => {
              const left = daysUntil(d.date)
              const cancelled = d.status === 'cancelled'
              return (
                <div
                  key={d.id}
                  className="card"
                  style={{
                    marginBottom: 10,
                    padding: 14,
                    opacity: cancelled ? 0.6 : 1,
                    animation: 'cardIn 240ms var(--e-out) both',
                    animationDelay: `${Math.min(i, 8) * 45}ms`,
                  }}
                >
                  <button
                    onClick={() => navigate(`/item/${d.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%' }}
                  >
                    <Tile category="subscription" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700 }}>{d.title}</span>
                      <span className="caption" style={{ display: 'block' }}>
                        {cancelled
                          ? 'Cancelled'
                          : left <= 0
                            ? `Renews today · ${shortDate(d.date)}`
                            : `Renews in ${left} day${left === 1 ? '' : 's'} · ${shortDate(d.date)}`}
                      </span>
                    </span>
                    <span className="num" style={{ fontSize: 16 }}>
                      {peso(d.amount)}
                    </span>
                  </button>

                  <div className="btnrow" style={{ marginTop: 12 }}>
                    <Button
                      small
                      variant="secondary"
                      icon={d.remindDaysBefore === null ? 'bell' : 'bellOff'}
                      onClick={() => {
                        const next = d.remindDaysBefore === null ? 1 : null
                        void updateDrop(d.id, { remindDaysBefore: next })
                        showToast(next === null ? 'Renewal reminder off' : 'Reminder set for the day before')
                      }}
                    >
                      {d.remindDaysBefore === null ? 'Remind' : 'Reminder on'}
                    </Button>
                    <Button
                      small
                      variant={cancelled ? 'secondary' : 'destructive'}
                      icon={cancelled ? 'refresh' : 'close'}
                      onClick={() => {
                        void updateDrop(
                          d.id,
                          { status: cancelled ? 'active' : 'cancelled' },
                          cancelled ? 'Marked active again' : 'Marked cancelled',
                        )
                        showToast(cancelled ? `${d.title} is active again` : `${d.title} marked cancelled`)
                      }}
                    >
                      {cancelled ? 'Reactivate' : 'Cancelled'}
                    </Button>
                  </div>
                </div>
              )
            })}

            <div
              className="card"
              style={{ display: 'flex', gap: 11, marginTop: 8, alignItems: 'flex-start' }}
            >
              <Icon name="help" size={19} color="var(--muted)" />
              <div className="body2" style={{ fontSize: 13 }}>
                Marking something cancelled only updates your records here. Cancel the plan with the
                provider too.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
