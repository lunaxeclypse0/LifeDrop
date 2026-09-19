import type { Category, Drop } from './types'
import { CATEGORIES } from './types'
import { daysUntil, longDate, peso, shortDate, todayISO } from './format'
import { liveDrops, monthlySubscriptionTotal } from './store'
import { sayAmount } from './speech'

/**
 * Answers the user's spoken questions from the local store.
 *
 * `/api/voice` only says *what* was asked. Every number below is computed
 * here, on the device, from drops that never leave it — so asking "how much
 * have I spent" does not ship the user's finances to a model.
 */

export type Period = 'this_month' | 'last_month' | 'this_week' | 'this_year' | 'all'
export type Question =
  | 'spend_total'
  | 'owed_total'
  | 'due_soon'
  | 'next_item'
  | 'subscriptions'
  | 'count'
  | 'none'

export interface VoiceIntent {
  kind: 'ask' | 'drop' | 'search' | 'unknown'
  transcript: string
  question: Question
  period: Period
  category: string
  subject: string
  query: string
  title: string
  merchant: string
  amount: number | null
  date: string
  time: string
  repeat: string
  reference: string
  say: string
}

/** What the app should do after speaking. */
export interface Answer {
  /** Read aloud and shown on screen. */
  speech: string
  /** Where to send the user, if anywhere. */
  goTo?: string
  /** Drops worth showing under the answer. */
  items?: Drop[]
}

function periodRange(period: Period): { from: string; to: string; label: string } {
  const now = new Date()
  // Local, not UTC — see the note in store.upcomingDrops.
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  switch (period) {
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: iso(from), to: iso(to), label: 'this month' }
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: iso(from), to: iso(to), label: 'last month' }
    }
    case 'this_week': {
      const from = new Date(now)
      from.setDate(now.getDate() - now.getDay())
      const to = new Date(from)
      to.setDate(from.getDate() + 6)
      return { from: iso(from), to: iso(to), label: 'this week' }
    }
    case 'this_year':
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, label: 'this year' }
    default:
      return { from: '0000-01-01', to: '9999-12-31', label: 'so far' }
  }
}

function inCategory(d: Drop, category: string): boolean {
  return !category || d.category === category
}

function catWord(category: string, plural = true): string {
  if (!category) return plural ? 'things' : 'thing'
  const c = CATEGORIES[category as Category]
  return (plural ? c.plural : c.label).toLowerCase()
}

/** Money that actually left: receipts, plus bills and subscriptions once settled. */
function spent(drops: Drop[], from: string, to: string, category: string): Drop[] {
  return liveDrops(drops)
    .filter((d) => d.date >= from && d.date <= to && d.amount !== null)
    .filter((d) => inCategory(d, category))
    .filter((d) => d.category === 'receipt' || d.status === 'paid')
}

function outstanding(drops: Drop[], category: string): Drop[] {
  return liveDrops(drops)
    .filter((d) => d.amount !== null && inCategory(d, category))
    .filter((d) => d.status === 'unpaid' || (d.category === 'subscription' && d.status === 'active'))
}

function sum(drops: Drop[]): number {
  return drops.reduce((t, d) => t + (d.amount ?? 0), 0)
}

function list(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

export function answer(intent: VoiceIntent, drops: Drop[]): Answer {
  const live = liveDrops(drops)

  if (!live.length) {
    return { speech: "You have not saved anything yet. Drop a bill or a receipt and I can start keeping track." }
  }

  switch (intent.question) {
    case 'spend_total': {
      const { from, to, label } = periodRange(intent.period)
      const items = spent(drops, from, to, intent.category)
      if (!items.length) {
        return { speech: `I do not have any ${catWord(intent.category)} recorded ${label}.`, goTo: '/spending' }
      }
      const total = sum(items)
      const top = [...items].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]
      return {
        speech:
          `You spent ${sayAmount(total)} ${label}, across ${items.length} ${items.length === 1 ? 'item' : 'items'}. ` +
          `The biggest was ${top.title}${top.merchant ? ` from ${top.merchant}` : ''}, at ${sayAmount(top.amount ?? 0)}.`,
        goTo: '/spending',
        items: [...items].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5),
      }
    }

    case 'owed_total': {
      const items = outstanding(drops, intent.category)
      if (!items.length) return { speech: 'Nothing is outstanding. You are all paid up.' }
      const total = sum(items)
      const soonest = [...items].sort((a, b) => a.date.localeCompare(b.date))[0]
      return {
        speech:
          `You owe ${sayAmount(total)} across ${items.length} ${items.length === 1 ? 'item' : 'items'}. ` +
          `The soonest is ${soonest.title}${soonest.merchant ? ` from ${soonest.merchant}` : ''}, ${dueWord(soonest.date)}.`,
        goTo: '/inbox',
        items: [...items].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
      }
    }

    case 'due_soon': {
      const today = todayISO()
      const horizon = intent.period === 'this_week' ? 7 : 14
      const items = live
        .filter((d) => d.status !== 'paid' && d.status !== 'done' && d.status !== 'cancelled')
        .filter((d) => inCategory(d, intent.category))
        .filter((d) => {
          const n = daysUntil(d.date)
          return n >= 0 ? n <= horizon : d.category === 'bill' || d.category === 'subscription'
        })
        .sort((a, b) => a.date.localeCompare(b.date))

      if (!items.length) {
        return { speech: `Nothing is due in the next ${horizon} days. You are clear.`, goTo: '/calendar' }
      }

      const overdue = items.filter((d) => d.date < today)
      const withAmount = items.filter((d) => d.amount !== null)
      const parts: string[] = []

      if (overdue.length) {
        parts.push(`${overdue.length} ${overdue.length === 1 ? 'item is' : 'items are'} already past due.`)
      }
      parts.push(
        `${items.length} ${items.length === 1 ? 'thing' : 'things'} coming up: ` +
          list(items.slice(0, 3).map((d) => `${d.title} ${dueWord(d.date)}`)) +
          (items.length > 3 ? `, and ${items.length - 3} more.` : '.'),
      )
      if (withAmount.length) parts.push(`That is ${sayAmount(sum(withAmount))} in total.`)

      return { speech: parts.join(' '), goTo: '/calendar', items: items.slice(0, 5) }
    }

    case 'next_item': {
      const needle = intent.subject.toLowerCase()
      const matches = live
        .filter((d) => !needle || `${d.title} ${d.merchant}`.toLowerCase().includes(needle))
        .filter((d) => d.status !== 'paid' && d.status !== 'done')
        .sort((a, b) => a.date.localeCompare(b.date))

      if (!matches.length) {
        return {
          speech: intent.subject
            ? `I could not find anything for ${intent.subject}.`
            : 'I could not tell what you were asking about.',
          goTo: intent.subject ? `/search` : undefined,
        }
      }
      const next = matches[0]
      const money = next.amount !== null ? `, for ${sayAmount(next.amount)}` : ''
      return {
        speech: `${next.title}${next.merchant ? ` from ${next.merchant}` : ''} is ${dueWord(next.date)}${money}.`,
        goTo: `/item/${next.id}`,
        items: [next],
      }
    }

    case 'subscriptions': {
      const subs = live.filter((d) => d.category === 'subscription' && d.status === 'active')
      if (!subs.length) return { speech: 'You have no active subscriptions saved.', goTo: '/subscriptions' }
      const monthly = monthlySubscriptionTotal(drops)
      return {
        speech:
          `You have ${subs.length} active ${subs.length === 1 ? 'subscription' : 'subscriptions'}, ` +
          `costing ${sayAmount(monthly)} a month, or ${sayAmount(monthly * 12)} a year. ` +
          `They are ${list(subs.slice(0, 4).map((s) => s.title))}.`,
        goTo: '/subscriptions',
        items: subs,
      }
    }

    case 'count': {
      const items = live.filter((d) => inCategory(d, intent.category))
      const word = catWord(intent.category, items.length !== 1)
      const total = sum(items.filter((d) => d.amount !== null))
      return {
        speech:
          `You have ${items.length} ${word} saved` +
          (total ? `, worth ${sayAmount(total)} altogether.` : '.'),
        goTo: intent.category ? `/vault/${intent.category}` : '/vault',
      }
    }

    default:
      return { speech: 'I can tell you what you have spent, what you owe, or what is coming up.' }
  }
}

function dueWord(iso: string): string {
  const n = daysUntil(iso)
  if (n < 0) return `${-n} ${-n === 1 ? 'day' : 'days'} overdue`
  if (n === 0) return 'due today'
  if (n === 1) return 'due tomorrow'
  if (n <= 6) return `due in ${n} days`
  if (n <= 365) return `due on ${shortDate(iso)}`
  return `due ${longDate(iso)}`
}

/** The examples shown under the mic before anyone has spoken. */
export const VOICE_EXAMPLES = [
  'How much have I spent this month?',
  'What do I still owe?',
  'What is due this week?',
  'When is my Meralco bill?',
  'What are my subscriptions?',
  'Meralco bill 3420 due September 30',
  'Find my Nike receipt',
]

/** Used only for the on-screen summary line, never spoken. */
export function shortSummary(a: Answer): string {
  return a.items?.length ? `${a.items.length} shown` : ''
}

export { peso }
