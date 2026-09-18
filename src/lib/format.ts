import type { Drop, Repeat } from './types'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function peso(amount: number | null, opts: { decimals?: boolean } = {}): string {
  if (amount === null || Number.isNaN(amount)) return '—'
  const showCents = opts.decimals ?? amount % 1 !== 0
  return (
    '₱' +
    amount.toLocaleString('en-PH', {
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
    })
  )
}

/** Compact peso for tiles: ₱48K, ₱1.2M. */
export function pesoCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return '₱' + (amount / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(amount) >= 1000) return '₱' + Math.round(amount / 1000) + 'K'
  return peso(amount)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Parses yyyy-mm-dd as local midnight, not UTC — avoids the off-by-one-day trap. */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function longDate(iso: string): string {
  const d = fromISO(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function shortDate(iso: string): string {
  const d = fromISO(iso)
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getDate()).padStart(2, '0')}`
}

export function monthUpper(iso: string): string {
  return MONTHS[fromISO(iso).getMonth()].slice(0, 3).toUpperCase()
}

export function dayNum(iso: string): string {
  return String(fromISO(iso).getDate()).padStart(2, '0')
}

export function weekday(iso: string): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    fromISO(iso).getDay()
  ]
}

/** Whole days from today to `iso`. Negative when overdue. */
export function daysUntil(iso: string): number {
  const now = fromISO(todayISO()).getTime()
  const then = fromISO(iso).getTime()
  return Math.round((then - now) / 86_400_000)
}

export function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** The short urgency word a card shows on its trailing edge. */
export function urgency(iso: string): { label: string; tone: 'danger' | 'warning' | 'info' | 'muted' } {
  const n = daysUntil(iso)
  if (n < 0) return { label: n === -1 ? 'Yesterday' : `${-n} days late`, tone: 'danger' }
  if (n === 0) return { label: 'Today', tone: 'danger' }
  if (n === 1) return { label: 'Tomorrow', tone: 'danger' }
  if (n <= 3) return { label: `In ${n} days`, tone: 'warning' }
  if (n <= 7) return { label: weekday(iso), tone: 'info' }
  if (n <= 365) return { label: shortDate(iso), tone: 'muted' }
  return { label: String(fromISO(iso).getFullYear()), tone: 'muted' }
}

/**
 * The short word on a card's trailing edge. Only things that can actually be
 * late get an urgency word — a receipt from last week is a record, not a
 * missed deadline, and a past appointment is simply over.
 */
export function trailingLabel(drop: Drop): { label: string; tone: 'danger' | 'warning' | 'info' | 'muted' | 'success' } {
  if (drop.status === 'paid' || drop.status === 'done') return { label: 'Done', tone: 'success' }
  if (drop.status === 'cancelled') return { label: 'Cancelled', tone: 'muted' }
  if (drop.category === 'receipt') return { label: shortDate(drop.date), tone: 'muted' }

  const left = daysUntil(drop.date)
  const canBeLate = drop.category === 'bill' || drop.category === 'subscription'
  if (left < 0 && !canBeLate) return { label: shortDate(drop.date), tone: 'muted' }
  return urgency(drop.date)
}

/** The "Due Sep 28" / "Renews Oct 01" line under a card title. */
export function whenLine(drop: Drop): string {
  const d = shortDate(drop.date)
  const t = drop.time ? ` · ${formatTime(drop.time)}` : ''
  switch (drop.category) {
    case 'bill':
      return drop.status === 'paid' ? `Paid · ${d}` : `Due ${d}`
    case 'subscription':
      return `Renews ${d}`
    case 'warranty':
      return `Expires ${longDate(drop.date)}`
    case 'document':
      return `Expires ${longDate(drop.date)}`
    case 'booking':
    case 'event':
      return `${d}${t}`
    default:
      return d
  }
}

/** Advances a repeating drop to its next occurrence. */
export function nextOccurrence(iso: string, repeat: Repeat): string {
  const d = fromISO(iso)
  switch (repeat) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'semiannual': d.setMonth(d.getMonth() + 6); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    default: return iso
  }
  return toISO(d)
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return shortDate(toISO(new Date(ts)))
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`
}

export function reminderLabel(days: number | null): string {
  if (days === null) return 'None'
  if (days === 0) return 'On the day'
  if (days === 1) return '1 day before'
  return `${days} days before`
}
