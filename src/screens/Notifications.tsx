import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/States'
import { Button, Tile, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { liveDrops, needsReviewDrops, useApp } from '../lib/store'
import { dueReminders, notificationPermission, requestNotificationPermission } from '../lib/reminders'
import { daysUntil, longDate, peso, relativeTime } from '../lib/format'
import type { Drop } from '../lib/types'

interface Item {
  key: string
  title: string
  body: string
  when: string
  drop?: Drop
  icon: 'bell' | 'alert' | 'drop'
  tone: string
}

export function Notifications() {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const settings = useApp((s) => s.settings)
  const showToast = useApp((s) => s.showToast)

  const perm = notificationPermission()

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []

    // Anything already due, worded the same way the system notification is.
    for (const r of dueReminders(drops, settings)) {
      out.push({
        key: `due-${r.drop.id}`,
        title: r.title,
        body: r.body,
        when: relativeTime(r.drop.updatedAt),
        drop: r.drop,
        icon: 'bell',
        tone: 'var(--danger)',
      })
    }

    // Everything landing in the next fortnight, so the screen is not empty
    // just because nothing has crossed its reminder threshold yet.
    for (const d of liveDrops(drops)) {
      if (out.some((o) => o.drop?.id === d.id)) continue
      const left = daysUntil(d.date)
      if (left < 0 || left > 14) continue
      if (d.status === 'paid' || d.status === 'done' || d.status === 'cancelled') continue
      out.push({
        key: `soon-${d.id}`,
        title: `${d.title} in ${left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'}`}`,
        body: `${d.amount !== null ? `${peso(d.amount)} · ` : ''}${d.merchant || longDate(d.date)}`,
        when: longDate(d.date),
        drop: d,
        icon: 'bell',
        tone: left <= 2 ? 'var(--warning)' : 'var(--info)',
      })
    }

    const review = needsReviewDrops(drops)
    if (review.length) {
      out.push({
        key: 'review',
        title: `You have ${review.length} drop${review.length > 1 ? 's' : ''} waiting for review.`,
        body: 'Tap to check the details and save.',
        when: relativeTime(review[0].createdAt),
        drop: review[0],
        icon: 'alert',
        tone: 'var(--primary)',
      })
    }

    return out
  }, [drops, settings])

  return (
    <div className="screen">
      <TopBar
        title="Notifications"
        back
        right={
          items.length > 0 ? (
            <button
              className="iconbtn plain"
              onClick={() => showToast('All caught up')}
              aria-label="Mark all read"
            >
              <Icon name="check" size={20} />
            </button>
          ) : undefined
        }
      />

      <div className="scrollhost no-nav">
        {perm !== 'granted' && (
          <div
            className="card"
            style={{
              marginBottom: 14,
              borderColor: 'color-mix(in srgb, var(--primary) 40%, var(--border))',
            }}
          >
            <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <Icon name="bell" size={19} color="var(--primary-ink)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Reminders are off</div>
                <div className="caption" style={{ marginTop: 2, lineHeight: 1.5 }}>
                  {perm === 'denied'
                    ? 'Your browser is blocking notifications for LifeDrop. Turn them on in site settings.'
                    : 'Allow notifications and a due date will never arrive without warning.'}
                </div>
              </div>
            </div>
            {perm === 'default' && (
              <div style={{ marginTop: 12 }}>
                <Button
                  small
                  onClick={async () => {
                    const next = await requestNotificationPermission()
                    showToast(next === 'granted' ? 'Reminders are on' : 'Reminders stay off')
                  }}
                >
                  Allow notifications
                </Button>
              </div>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            art="nothing"
            title="Nothing needs you"
            body="Reminders about bills, renewals and appointments show up here."
          />
        ) : (
          <div className="rows">
            {items.map((n, i) => (
              <button
                key={n.key}
                className="row"
                style={{
                  alignItems: 'flex-start',
                  animation: 'cardIn 240ms var(--e-out) both',
                  animationDelay: `${Math.min(i, 8) * 45}ms`,
                }}
                onClick={() => n.drop && navigate(`/item/${n.drop.id}`)}
              >
                <Tile
                  icon={n.drop && n.icon !== 'alert' ? n.drop.category : n.icon}
                  category={n.icon === 'alert' ? undefined : n.drop?.category}
                  color={n.icon === 'alert' ? n.tone : undefined}
                  size="sm"
                />
                <span className="mid">
                  <span className="t">{n.title}</span>
                  <span className="d">{n.body}</span>
                  <span className="caption" style={{ display: 'block', marginTop: 3 }}>
                    {n.when}
                  </span>
                </span>
                <Icon name="chev" size={16} color="var(--muted)" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
