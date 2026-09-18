import type { AppSettings, Drop } from './types'
import { daysUntil, longDate, peso, shortDate } from './format'

const FIRED_KEY = 'lifedrop.remindersFired'

/**
 * A web app cannot wake itself on a schedule without a push server, so
 * reminders are evaluated whenever LifeDrop is open or comes back to the
 * foreground, and each one fires at most once per occurrence. Wiring a real
 * push backend later means calling `dueReminders()` on the server instead.
 */

type FiredMap = Record<string, string>

function readFired(): FiredMap {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') as FiredMap
  } catch {
    return {}
  }
}

function writeFired(map: FiredMap) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(map))
  } catch {
    /* private mode — reminders just repeat next session */
  }
}

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied'
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

function inQuietHours(): boolean {
  const h = new Date().getHours()
  return h >= 22 || h < 7
}

function prefAllows(drop: Drop, settings: AppSettings): boolean {
  const p = settings.prefs
  if (drop.needsReview) return p.review
  switch (drop.category) {
    case 'bill':
      return p.bills
    case 'subscription':
      return p.renew
    case 'event':
    case 'booking':
      return p.events
    default:
      return p.bills
  }
}

export interface DueReminder {
  drop: Drop
  title: string
  body: string
}

/** Every reminder that has come due and has not fired for this occurrence. */
export function dueReminders(drops: Drop[], settings: AppSettings): DueReminder[] {
  const fired = readFired()
  const out: DueReminder[] = []

  for (const drop of drops) {
    if (drop.archived || drop.remindDaysBefore === null) continue
    if (drop.status === 'paid' || drop.status === 'done' || drop.status === 'cancelled') continue
    if (!prefAllows(drop, settings)) continue

    const left = daysUntil(drop.date)
    if (left > drop.remindDaysBefore || left < 0) continue
    // One fire per date — moving the date re-arms the reminder.
    if (fired[drop.id] === drop.date) continue

    out.push({ drop, ...reminderCopy(drop, settings) })
  }
  return out
}

function reminderCopy(drop: Drop, settings: AppSettings): { title: string; body: string } {
  if (settings.prefs.hideOnLock) {
    return { title: 'LifeDrop reminder', body: 'Open LifeDrop to see what is coming up.' }
  }
  const left = daysUntil(drop.date)
  const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`
  const amount = drop.amount !== null ? `${peso(drop.amount)} · ` : ''

  switch (drop.category) {
    case 'bill':
      return { title: `${drop.title} is due ${when}`, body: `${amount}${drop.merchant} · ${longDate(drop.date)}` }
    case 'subscription':
      return { title: `${drop.title} renews ${when}`, body: `${amount}${shortDate(drop.date)}` }
    case 'warranty':
      return { title: `${drop.title} expires soon`, body: `${drop.merchant} · ${longDate(drop.date)}` }
    case 'document':
      return { title: `${drop.title} expires soon`, body: `${drop.merchant} · ${longDate(drop.date)}` }
    default:
      return { title: `${drop.title} is ${when}`, body: `${drop.merchant} · ${longDate(drop.date)}` }
  }
}

/** Fires anything due. Returns how many notifications were shown. */
export async function runReminderSweep(drops: Drop[], settings: AppSettings): Promise<number> {
  const due = dueReminders(drops, settings)
  if (!due.length) return 0
  if (notificationPermission() !== 'granted') return 0
  if (settings.prefs.quiet && inQuietHours()) return 0

  const fired = readFired()
  let shown = 0

  for (const item of due) {
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      const options: NotificationOptions = {
        body: item.body,
        tag: `lifedrop-${item.drop.id}-${item.drop.date}`,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: { dropId: item.drop.id },
      }
      if (reg) await reg.showNotification(item.title, options)
      else new Notification(item.title, options)
      fired[item.drop.id] = item.drop.date
      shown++
    } catch {
      /* a failed notification should never break the sweep */
    }
  }

  writeFired(fired)
  return shown
}

/** Clears the fired mark so an edited drop can remind again. */
export function rearm(dropId: string): void {
  const fired = readFired()
  delete fired[dropId]
  writeFired(fired)
}
