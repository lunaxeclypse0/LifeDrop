import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Sheet'
import { DropPreview, EmptyState } from '../components/States'
import { Button, SectionHead, StatusBadge, Tile, TopBar, catColor } from '../components/UI'
import { useApp } from '../lib/store'
import { CATEGORIES, REPEAT_LABEL, isPayable } from '../lib/types'
import { longDate, formatTime, peso, relativeTime, reminderLabel, trailingLabel, whenLine } from '../lib/format'

const TONE: Record<string, string> = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  muted: 'var(--text2)',
  success: 'var(--success)',
}

const DOT: Record<string, string> = {
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  border: 'var(--border)',
}

export function Detail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const drop = useApp((s) => s.drops.find((d) => d.id === id))
  const markDone = useApp((s) => s.markDone)
  const updateDrop = useApp((s) => s.updateDrop)
  const removeDrop = useApp((s) => s.removeDrop)
  const setArchived = useApp((s) => s.setArchived)
  const showToast = useApp((s) => s.showToast)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!drop) {
    return (
      <div className="screen">
        <TopBar title="Not found" back />
        <div className="scrollhost no-nav">
          <EmptyState
            art="nothing"
            title="This drop is gone"
            body="It may have been deleted from another tab."
            action={
              <Button variant="secondary" onClick={() => navigate('/home')} style={{ width: 'auto', padding: '13px 20px' }}>
                Back to Home
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const settled = drop.status === 'paid' || drop.status === 'done'
  const trailing = trailingLabel(drop)

  const share = async () => {
    const text = `${drop.title}${drop.merchant ? ` · ${drop.merchant}` : ''}\n${whenLine(drop)}${
      drop.amount !== null ? `\n${peso(drop.amount)}` : ''
    }`
    try {
      if (navigator.share) await navigator.share({ title: drop.title, text })
      else {
        await navigator.clipboard.writeText(text)
        showToast('Details copied')
      }
    } catch {
      /* the user dismissed the share sheet */
    }
  }

  const rows: [string, string][] = [
    ['Type', CATEGORIES[drop.category].label],
    [drop.category === 'receipt' ? 'Merchant' : 'Provider', drop.merchant || '—'],
    ['Amount', drop.amount !== null ? peso(drop.amount) : '—'],
    ['Date', longDate(drop.date) + (drop.time ? ` · ${formatTime(drop.time)}` : '')],
    ['Repeats', REPEAT_LABEL[drop.repeat]],
    ['Reminder', reminderLabel(drop.remindDaysBefore)],
    ['Reference', drop.reference || '—'],
  ]
  if (drop.notes) rows.push(['Notes', drop.notes])

  return (
    <div className="screen">
      <TopBar
        back
        right={
          <>
            <button className="iconbtn" onClick={share} aria-label="Share">
              <Icon name="share" size={19} />
            </button>
            <button className="iconbtn" onClick={() => navigate(`/item/${drop.id}/edit`)} aria-label="Edit">
              <Icon name="edit" size={19} />
            </button>
          </>
        }
      />

      <div className="scrollhost no-nav">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <Tile category={drop.category} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="display" style={{ fontSize: 24, margin: 0, lineHeight: 1.2 }}>
              {drop.title}
            </h2>
            <div className="body2" style={{ marginTop: 3 }}>
              {drop.merchant}
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
              <StatusBadge status={drop.status} />
              <span className="badge" style={{ background: 'var(--hair)', color: TONE[trailing.tone] }}>
                {trailing.label}
              </span>
            </div>
          </div>
        </div>

        {drop.amount !== null && (
          <div className="card" style={{ marginBottom: 14, textAlign: 'center', padding: '20px 16px' }}>
            <div className="seclabel">{isPayable(drop.category) ? 'Amount due' : 'Amount'}</div>
            <div
              className="num"
              style={{ fontSize: 38, marginTop: 6, letterSpacing: '-1.6px', color: catColor(drop.category) }}
            >
              {peso(drop.amount)}
            </div>
            <div className="caption" style={{ marginTop: 2 }}>
              {whenLine(drop)}
            </div>
          </div>
        )}

        <div className="btnrow" style={{ marginBottom: 18 }}>
          <Button
            small
            icon="check"
            onClick={() => {
              void markDone(drop.id)
              navigator.vibrate?.(12)
              showToast(
                drop.repeat !== 'none'
                  ? `Marked ${isPayable(drop.category) ? 'paid' : 'done'} · rolled to the next one`
                  : `Marked ${isPayable(drop.category) ? 'paid' : 'done'}`,
              )
            }}
            style={{ opacity: settled ? 0.5 : 1 }}
          >
            {isPayable(drop.category) ? 'Mark Paid' : 'Mark Done'}
          </Button>
          <Button
            small
            variant="secondary"
            icon="bell"
            onClick={() => {
              const next = drop.remindDaysBefore === null ? 1 : null
              void updateDrop(drop.id, { remindDaysBefore: next }, next === null ? 'Reminder removed' : 'Reminder set')
              showToast(next === null ? 'Reminder off' : 'Reminder set for the day before')
            }}
          >
            {drop.remindDaysBefore === null ? 'Remind Me' : 'Reminder on'}
          </Button>
        </div>

        <SectionHead label="Details" first />
        <div className="card">
          {rows.map(([k, v]) => (
            <div className="kv" key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>

        <SectionHead label="Original drop" />
        <DropPreview imageId={drop.imageId} fileName={drop.fileName} category={drop.category} />

        <SectionHead label="History" />
        <div className="card">
          {drop.history.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: i === drop.history.length - 1 ? 0 : 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                <i style={{ width: 9, height: 9, borderRadius: 999, background: DOT[h.tone], marginTop: 5 }} />
                {i < drop.history.length - 1 && (
                  <i style={{ flex: 1, width: 1.5, background: 'var(--border)', marginTop: 4 }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{h.label}</div>
                <div className="caption">{relativeTime(h.at)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="divider" />

        <Button
          variant="secondary"
          icon={drop.archived ? 'refresh' : 'inbox'}
          onClick={() => {
            void setArchived(drop.id, !drop.archived)
            showToast(drop.archived ? 'Restored to Inbox' : 'Archived')
          }}
        >
          {drop.archived ? 'Restore to Inbox' : 'Archive'}
        </Button>
        <Button variant="destructive" icon="trash" onClick={() => setConfirmDelete(true)}>
          Delete this drop
        </Button>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this drop?">
        <p className="body2" style={{ margin: '0 0 18px' }}>
          {drop.title} and its original file are removed from this device. This cannot be undone.
        </p>
        <Button
          variant="destructive"
          icon="trash"
          onClick={() => {
            void removeDrop(drop.id)
            navigator.vibrate?.([18, 40, 18])
            showToast(`${drop.title} deleted`)
            navigate('/home', { replace: true })
          }}
        >
          Delete
        </Button>
        <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
          Keep it
        </Button>
      </Modal>
    </div>
  )
}
