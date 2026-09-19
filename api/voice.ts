/**
 * POST /api/voice — turns a spoken sentence into an intent, and optionally
 * answers it.
 *
 * Two modes, chosen by the user in Privacy & Security:
 *
 * - Without `summary`, only the transcript is sent. The reply says *what was
 *   asked* and the app computes the figures locally, so nothing about the
 *   user's money leaves their device.
 * - With `summary`, a compact view of their drops is included so the model can
 *   answer questions the fixed set does not cover. That is more capable and
 *   less private, which is why it is a setting and not a default assumption.
 *
 * Env: same key as /api/extract.
 */

export const config = { runtime: 'edge' }

import {
  answerText,
  callWithThinking,
  limitResponse,
  modelChain,
  thinkingConfig,
  worthFallingBack,
  type Candidate,
  type ThinkMode,
} from './_model'

// See api/_model.ts. A spoken question should come back before the user
// wonders whether the app heard them.
let knownThinkMode: ThinkMode | null = null

const CATEGORIES = ['bill', 'receipt', 'booking', 'subscription', 'warranty', 'document', 'event'] as const
const REPEATS = ['none', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'] as const
const KINDS = ['ask', 'answer', 'drop', 'search', 'unknown'] as const
const QUESTIONS = [
  'spend_total', // how much have I spent
  'owed_total', // how much do I still owe
  'due_soon', // what is coming up
  'next_item', // when is my <thing>
  'subscriptions', // what am I paying monthly
  'count', // how many things do I have
  'none',
] as const
const PERIODS = ['this_month', 'last_month', 'this_week', 'this_year', 'all'] as const

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: [...KINDS] },
    question: { type: 'STRING', enum: [...QUESTIONS] },
    period: { type: 'STRING', enum: [...PERIODS] },
    category: { type: 'STRING', description: 'One of the categories, or empty for all.' },
    subject: { type: 'STRING', description: 'For next_item: the thing asked about, e.g. "Meralco".' },
    query: { type: 'STRING', description: 'For search: the words to look for.' },
    title: { type: 'STRING' },
    merchant: { type: 'STRING' },
    amount: { type: 'STRING', description: 'Digits only. Empty if not said.' },
    date: { type: 'STRING', description: 'yyyy-mm-dd. Empty if not said.' },
    time: { type: 'STRING', description: 'HH:MM 24-hour. Empty if not said.' },
    repeat: { type: 'STRING', enum: [...REPEATS] },
    reference: { type: 'STRING' },
    say: { type: 'STRING', description: 'For answer and unknown: what to say back, out loud.' },
  },
  required: ['kind'],
} as const

function prompt(today: string): string {
  return `You route one spoken sentence from a Philippine personal-organizer app. Today is ${today}.

The speaker may mix English and Tagalog. Amounts are pesos and may be spoken in words ("tatlong libo apat na raan bente" = 3420) or in English ("three thousand four twenty").

Choose exactly one "kind":

"ask" — they want to know something the app can work out itself.
  Set "question" to one of:
    spend_total    how much have I spent / total cost / gastos
    owed_total     how much do I still owe / unpaid / babayaran
    due_soon       what is due / coming up / this week / ano ang bayarin
    next_item      when is my <thing> — also set "subject" to the thing named
    subscriptions  what am I paying monthly / subscriptions
    count          how many receipts / bills / items do I have
  Set "period" when a timeframe is named, else "all". Set "category" when one is named.

"drop" — they are recording a new thing. "Meralco bill 3420 due September 30",
  "Grab receipt 318 pesos", "dentist appointment Friday 3pm".
  Fill title, merchant, amount, date, time, repeat, reference from what was said.
  Leave anything not said empty. Never invent an amount or a date.
  Resolve spoken dates against today: "Friday" = the coming Friday, "next month" etc.

"search" — they want to find something they saved. "Hanapin ang Nike receipt",
  "find my passport", "show me September receipts". Put the useful words in "query"
  and leave out filler like "find", "show me", "hanapin".

"unknown" — it is not any of these, or it is too garbled. Put one short, friendly
  sentence in "say" telling them what they can ask for.

Prefer "ask" over "search" when they want a number or a summary rather than a list.
Prefer "drop" only when they clearly describe a NEW thing with at least a name.`
}

function withData(today: string, summary: string): string {
  return `${prompt(today)}

You have also been given the person's saved items below. When their question is
about this data but does not fit one of the "ask" questions above, use "answer"
instead and put the reply in "say".

Rules for "say":
- Speak it aloud, so no markdown, no bullet points, no currency symbols. Write
  amounts as "3,420 pesos".
- Two or three sentences at most. Lead with the number or the fact they asked for.
- Only state what the data shows. If it is not there, say so plainly.
- Today is ${today}; work out "last month", "this week" and so on from that.

Their saved items, one per line, as title | merchant | amount | category | date | status:
${summary}`
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function oneOf<T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const key =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY_LIFEDROP ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY
  if (!key) return json({ error: 'not_configured' }, 503)

  let transcript = ''
  let summary = ''
  let today = new Date().toISOString().slice(0, 10)
  try {
    const body = (await request.json()) as { transcript?: string; today?: string; summary?: string }
    transcript = str(body.transcript).slice(0, 500)
    // Bounded so a large vault cannot blow past the model's context or the
    // free tier's token budget.
    summary = str(body.summary).slice(0, 24000)
    if (body.today && /^\d{4}-\d{2}-\d{2}$/.test(body.today)) today = body.today
  } catch {
    return json({ error: 'bad_request', message: 'Expected JSON.' }, 400)
  }

  if (!transcript) return json({ error: 'bad_request', message: 'Nothing was said.' }, 400)

  const call = (model: string, mode: ThinkMode) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${summary ? withData(today, summary) : prompt(today)}\n\nThey said: "${transcript}"`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            maxOutputTokens: 1024,
            ...thinkingConfig(mode),
          },
        }),
      },
    )

  // Out of quota on the good model is not the end of the day — the lite one
  // keeps its own allowance. See modelChain().
  const tried = modelChain()
  const remember = (m: ThinkMode) => {
    knownThinkMode = m
  }
  let res: Response
  try {
    res = await callWithThinking((mode) => call(tried[0], mode), knownThinkMode, remember)
    for (let i = 1; i < tried.length && worthFallingBack(res.status); i++) {
      res = await callWithThinking((mode) => call(tried[i], mode), knownThinkMode, remember)
    }
  } catch {
    return json({ error: 'upstream_unreachable' }, 502)
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).split(key).join('[redacted]')
    if (res.status === 429) return limitResponse(detail)
    return json({ error: 'upstream_error', status: res.status, detail: detail.slice(0, 300) }, 502)
  }

  const payload = (await res.json()) as { candidates?: Candidate[] }
  const text = answerText(payload.candidates?.[0])
  if (!text.trim()) return json({ error: 'empty_response' }, 502)

  let out: Record<string, unknown>
  try {
    out = JSON.parse(text) as Record<string, unknown>
  } catch {
    return json({ error: 'bad_model_json' }, 502)
  }

  const kind = oneOf(out.kind, KINDS, 'unknown')
  const amountRaw = str(out.amount).replace(/[^\d.]/g, '')

  return json({
    kind,
    transcript,
    question: oneOf(out.question, QUESTIONS, 'none'),
    period: oneOf(out.period, PERIODS, 'all'),
    category: (CATEGORIES as readonly string[]).includes(str(out.category)) ? str(out.category) : '',
    subject: str(out.subject),
    query: str(out.query),
    title: str(out.title),
    merchant: str(out.merchant),
    amount: amountRaw && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(out.date)) ? str(out.date) : '',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(str(out.time)) ? str(out.time) : '',
    repeat: oneOf(out.repeat, REPEATS, 'none'),
    reference: str(out.reference),
    say: str(out.say),
  })
}
