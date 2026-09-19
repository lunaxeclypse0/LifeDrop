/**
 * Covers the two halves of voice that can actually be wrong:
 * the intent routing in api/voice.ts (Gemini stubbed), and the answers in
 * src/lib/assistant.ts, which are computed on-device from real drops.
 *
 * Bundled through esbuild first, because the app's imports are extensionless
 * and Node's resolver is not:
 *
 *   npm run test:voice
 */
import handler from '../api/voice'
import { answer, type VoiceIntent } from '../src/lib/assistant'
import type { Drop } from '../src/lib/types'
import { emailToUsername, usernameToEmail, validateUsername } from '../src/lib/username'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}`, detail ?? '') }
}

// ---------------------------------------------------------------------------
// intent routing
// ---------------------------------------------------------------------------

function stub(obj: Record<string, unknown>, status = 200) {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
      { status, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch
}

const post = (transcript: string) =>
  new Request('http://localhost/api/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript, today: '2026-09-19' }),
  })

delete process.env.GEMINI_API_KEY
check('503 without a key', (await handler(post('hi'))).status === 503)
process.env.GEMINI_API_KEY = 'test'

check('400 on an empty transcript', (await handler(post(''))).status === 400)

{
  stub({ kind: 'ask', question: 'spend_total', period: 'this_month' })
  const b = (await (await handler(post('how much did I spend'))).json()) as VoiceIntent
  check('routes a spending question', b.kind === 'ask' && b.question === 'spend_total', b)
  check('  keeps the period', b.period === 'this_month', b.period)
}
{
  stub({ kind: 'drop', title: 'Electricity Bill', merchant: 'Meralco', amount: '3,420', date: '2026-09-30', repeat: 'monthly' })
  const b = (await (await handler(post('meralco bill 3420 due september 30'))).json()) as VoiceIntent
  check('routes a spoken drop', b.kind === 'drop', b.kind)
  check('  parses the amount', b.amount === 3420, b.amount)
  check('  keeps the date', b.date === '2026-09-30', b.date)
}
{
  stub({ kind: 'search', query: 'Nike receipt' })
  const b = (await (await handler(post('hanapin ang nike receipt'))).json()) as VoiceIntent
  check('routes a search', b.kind === 'search' && b.query === 'Nike receipt', b)
}
{
  stub({ kind: 'drop', title: 'Bill', amount: 'about three thousand', date: 'next week', time: '99:99', repeat: 'often' })
  const b = (await (await handler(post('garbled'))).json()) as VoiceIntent
  check('drops an unparseable amount rather than guessing', b.amount === null, b.amount)
  check('  drops an unparseable date', b.date === '', b.date)
  check('  drops an impossible time', b.time === '', b.time)
  check('  falls back to a valid repeat', b.repeat === 'none', b.repeat)
}

// ---------------------------------------------------------------------------
// answers, computed locally
// ---------------------------------------------------------------------------

const base = {
  time: null, reference: '', notes: '', fileName: 'x', imageId: null,
  needsReview: false, archived: false, createdAt: 1, updatedAt: 1, history: [],
} as const

const iso = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
const thisMonth = (day: number) => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const DROPS: Drop[] = [
  { ...base, id: 'a', title: 'Nike Receipt', merchant: 'Nike Park', amount: 4295, category: 'receipt', date: thisMonth(3), status: 'saved', repeat: 'none', remindDaysBefore: null },
  { ...base, id: 'b', title: 'Grab Receipt', merchant: 'BGC', amount: 318, category: 'receipt', date: thisMonth(5), status: 'saved', repeat: 'none', remindDaysBefore: null },
  { ...base, id: 'c', title: 'Electricity Bill', merchant: 'Meralco', amount: 3420, category: 'bill', date: iso(2), status: 'unpaid', repeat: 'monthly', remindDaysBefore: 3 },
  { ...base, id: 'd', title: 'Netflix', merchant: 'Netflix', amount: 549, category: 'subscription', date: iso(9), status: 'active', repeat: 'monthly', remindDaysBefore: 1 },
  { ...base, id: 'e', title: 'Passport', merchant: 'DFA', amount: null, category: 'document', date: iso(900), status: 'valid', repeat: 'none', remindDaysBefore: 90 },
]

const ask = (over: Partial<VoiceIntent>): VoiceIntent => ({
  kind: 'ask', transcript: '', question: 'none', period: 'all', category: '',
  subject: '', query: '', title: '', merchant: '', amount: null, date: '',
  time: '', repeat: 'none', reference: '', say: '', ...over,
})

{
  const a = answer(ask({ question: 'spend_total', period: 'this_month' }), DROPS)
  check('spend total adds only the receipts', a.speech.includes('4,613'), a.speech)
  check('  names the biggest one', a.speech.includes('Nike Receipt'), a.speech)
}
{
  const a = answer(ask({ question: 'owed_total' }), DROPS)
  check('owed adds the unpaid bill and the live subscription', a.speech.includes('3,969'), a.speech)
}
{
  const a = answer(ask({ question: 'due_soon' }), DROPS)
  check('due soon finds the bill', a.speech.includes('Electricity Bill'), a.speech)
  check('  leaves the 900-day passport out', !a.speech.includes('Passport'), a.speech)
}
{
  const a = answer(ask({ question: 'next_item', subject: 'meralco' }), DROPS)
  check('next_item matches on merchant', a.speech.includes('Electricity Bill'), a.speech)
  check('  links straight to it', a.goTo === '/item/c', a.goTo)
}
{
  const a = answer(ask({ question: 'subscriptions' }), DROPS)
  check('subscriptions give a monthly and a yearly', a.speech.includes('549') && a.speech.includes('6,588'), a.speech)
}
{
  const a = answer(ask({ question: 'count', category: 'receipt' }), DROPS)
  check('count is per category', a.speech.includes('2 receipts'), a.speech)
}
{
  const a = answer(ask({ question: 'spend_total' }), [])
  check('an empty vault says so instead of zero', a.speech.includes('not saved anything'), a.speech)
}

// ---------------------------------------------------------------------------
// usernames
// ---------------------------------------------------------------------------

check('rejects a short username', validateUsername('ab') !== null)
check('rejects spaces', validateUsername('lance reyes') !== null)
check('rejects a leading symbol', validateUsername('.lance') !== null)
check('rejects doubled symbols', validateUsername('lan..ce') !== null)
check('accepts a normal one', validateUsername('lance.reyes') === null, validateUsername('lance.reyes'))
check('accepts digits', validateUsername('lance99') === null)
check(
  'case folds, so one person is one account',
  usernameToEmail('Lance') === usernameToEmail('  lance  '),
)
check(
  'maps to a domain that can never receive mail',
  usernameToEmail('lance').endsWith('@lifedrop.invalid'),
  usernameToEmail('lance'),
)
check('round-trips back to the username', emailToUsername(usernameToEmail('lance')) === 'lance')
check('leaves a real email alone', emailToUsername('a@b.com') === 'a@b.com')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
