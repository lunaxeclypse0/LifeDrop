/**
 * POST /api/extract — reads a dropped bill, receipt, booking or document.
 *
 * Runs on Vercel, so the Gemini key stays on the server and never reaches the
 * browser bundle. The client contract is the one in src/lib/extract.ts:
 * multipart in, an `Extraction` JSON out, 422 when the drop is unreadable.
 *
 * Env:
 *   GEMINI_API_KEY   required — from https://aistudio.google.com/apikey
 *   GEMINI_MODEL     optional — defaults to gemini-3.6-flash
 */

/**
 * The Edge runtime is what makes the Web-standard signature below valid. On
 * Vercel's default Node runtime a handler is called with (req, res) and must
 * end the response itself, so returning a `Response` there leaves the request
 * hanging until the gateway gives up. Edge speaks Request/Response natively —
 * and `request.formData()` comes free with it.
 */
export const config = { runtime: 'edge' }

import {
  answerText,
  callWithThinking,
  limitResponse,
  thinkingConfig,
  type Candidate,
  type ThinkMode,
} from './_model'

// Google retires model ids and returns 404 for them, so this is the one value
// here most likely to go stale. `GEMINI_MODEL` overrides it without a code
// change; the 404 body names the replacement when that day comes.
const DEFAULT_MODEL = 'gemini-3.6-flash'
const CATEGORIES = [
  'bill',
  'receipt',
  'booking',
  'subscription',
  'warranty',
  'document',
  'event',
] as const
const REPEATS = ['none', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'] as const

/**
 * Every field is asked for as a string. Gemini is far more reliable with a flat
 * string schema than with nullable numbers, and coercing on the way out costs
 * nothing.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    readable: { type: 'STRING', enum: ['yes', 'no'] },
    title: { type: 'STRING' },
    merchant: { type: 'STRING' },
    amount: { type: 'STRING', description: 'Digits only, e.g. "1899" or "842.35". Empty if none.' },
    category: { type: 'STRING', enum: [...CATEGORIES] },
    date: { type: 'STRING', description: 'yyyy-mm-dd. Empty if none found.' },
    time: { type: 'STRING', description: 'HH:MM 24-hour. Empty if none.' },
    repeat: { type: 'STRING', enum: [...REPEATS] },
    remindDaysBefore: { type: 'STRING', description: 'Whole days, e.g. "2". Empty for no reminder.' },
    reference: { type: 'STRING' },
    notes: { type: 'STRING' },
    confidence: { type: 'STRING', description: '0 to 1, e.g. "0.93"' },
    uncertain: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['readable', 'title', 'category', 'confidence'],
} as const

function prompt(today: string): string {
  return `You read a single document that someone dropped into a personal organizer app and return its details.

Today is ${today}. The user is in the Philippines: amounts are pesos, and dates are usually written day-month-year or "September 28, 2026".

Rules:
- "readable": "no" if the image is too blurry, too dark, cropped, or is not a document at all. When it is "no", leave every other field empty.
- "title": short and human, what the thing IS. "Internet Bill", "Nike Receipt", "Cebu Pacific Flight". Not the merchant name alone, not a sentence.
- "merchant": who it is from or with. "Globe Fiber", "Meralco", "Nike Park BGC".
- "amount": the total the user pays. For a bill, the amount due, not the previous balance or a subtotal. Digits only, no currency symbol, no thousands separators.
- "category": one of bill, receipt, booking, subscription, warranty, document, event.
  - bill = something owed with a due date (utilities, internet, credit card)
  - receipt = something already paid
  - subscription = a recurring charge that renews (Netflix, Spotify, iCloud)
  - booking = travel or a reservation
  - warranty = proof of purchase with an expiry
  - event = an appointment with a date and time
  - document = ID, passport, certificate, anything else worth keeping
- "date": the date that MATTERS for this category — the due date for a bill, the renewal date for a subscription, the purchase date for a receipt, the travel or appointment date for a booking or event, the expiry for a warranty or document. Never today's date unless the document says so.
- "repeat": "monthly" for a normal utility bill or monthly subscription, "yearly" for an annual one, otherwise "none".
- "remindDaysBefore": a sensible lead time — 2 or 3 for a bill, 1 for a subscription or appointment, 30 for a warranty, 90 for a passport. Empty for a receipt.
- "reference": account number, booking reference, serial, OR number. Whatever identifies this specific document.
- "notes": anything else genuinely useful, in a few words. Empty if nothing.
- "confidence": your honest confidence in the amount AND the date together. Be strict — 0.95 when both are printed plainly, 0.5 when you are inferring either.
- "uncertain": list the field names you are least sure of, from: amount, date, merchant, category.

Do not invent values. An empty string is always better than a guess.`
}

function toNumber(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const n = Number(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function toInt(raw: unknown): number | null {
  const n = toNumber(raw)
  return n === null ? null : Math.round(n)
}

function oneOf<T extends readonly string[]>(raw: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T[number])
    : fallback
}

/** yyyy-mm-dd that is also a date that exists — "2026-02-31" is not. */
function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Chunked so the spread never grows large enough to overflow the stack. */
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** Edge caps the request body, and the client downscales well below this. */
const MAX_BYTES = 4 * 1024 * 1024

let knownThinkMode: ThinkMode | null = null

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  // `GEMINI_API_KEY` is the documented name, but the key is just as often
  // saved under a project-specific one. Accept the common spellings rather
  // than fail with a "not configured" error the user cannot see the cause of.
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY_LIFEDROP ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY
  if (!key) {
    // 503 is the client's signal that the model is not wired up yet, as
    // opposed to a drop it genuinely could not read.
    return json({ error: 'not_configured', message: 'GEMINI_API_KEY is not set on the server.' }, 503)
  }

  let file: File | null = null
  let today = new Date().toISOString().slice(0, 10)

  try {
    const form = await request.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
    const t = form.get('today')
    if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) today = t
  } catch {
    return json({ error: 'bad_request', message: 'Expected multipart/form-data.' }, 400)
  }

  if (!file || file.size === 0) {
    return json({ error: 'bad_request', message: 'No file received.' }, 400)
  }

  if (file.size > MAX_BYTES) {
    return json({ error: 'too_large', message: 'That file is too big to read.' }, 413)
  }

  // Gemini takes images and PDFs inline; anything else it cannot read.
  const mime = file.type || 'application/octet-stream'
  if (!/^image\/|^application\/pdf$/.test(mime)) {
    return json({ error: 'unreadable', message: 'That file type cannot be read.' }, 422)
  }

  const data = toBase64(new Uint8Array(await file.arrayBuffer()))
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL

  const call = (mode: ThinkMode) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt(today) }, { inline_data: { mime_type: mime, data } }] },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // The answer is a dozen short fields. The ceiling is generous because
          // reasoning tokens come out of the same budget, and a cut-off reply
          // is worse than a slow one.
          maxOutputTokens: 2048,
          ...thinkingConfig(mode),
        },
      }),
    })

  let res: Response
  try {
    res = await callWithThinking(call, knownThinkMode, (m) => {
      knownThinkMode = m
    })
  } catch {
    return json({ error: 'upstream_unreachable', message: 'Could not reach the model.' }, 502)
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).split(key).join('[redacted]')
    if (res.status === 429) return limitResponse(detail)
    if (res.status === 404) {
      return json(
        {
          error: 'model_unavailable',
          message: `The model "${model}" is not available to this key. Set GEMINI_MODEL to a current one.`,
          detail: detail.slice(0, 400),
        },
        502,
      )
    }
    return json({ error: 'upstream_error', status: res.status, detail: detail.slice(0, 400) }, 502)
  }

  const payload = (await res.json()) as { candidates?: Candidate[] }
  const candidate = payload.candidates?.[0]
  const text = answerText(candidate)
  if (!text.trim()) {
    return json(
      {
        error: 'empty_response',
        message:
          candidate?.finishReason === 'MAX_TOKENS'
            ? 'The model ran out of room before it answered.'
            : 'The model returned nothing.',
        finishReason: candidate?.finishReason ?? '',
      },
      502,
    )
  }

  let out: Record<string, unknown>
  try {
    out = JSON.parse(text) as Record<string, unknown>
  } catch {
    return json({ error: 'bad_model_json', detail: text.slice(0, 400) }, 502)
  }

  if (out.readable === 'no') {
    return json({ error: 'unreadable', message: 'The document could not be read.' }, 422)
  }

  const date = typeof out.date === 'string' && isRealDate(out.date) ? out.date : today
  // Hours and minutes have to be in range — "25:99" matched a looser pattern.
  const time =
    typeof out.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(out.time) ? out.time : null
  const confidence = Math.max(0, Math.min(1, toNumber(out.confidence) ?? 0.8))

  return json({
    title: (typeof out.title === 'string' && out.title.trim()) || 'Untitled drop',
    merchant: typeof out.merchant === 'string' ? out.merchant.trim() : '',
    amount: toNumber(out.amount),
    category: oneOf(out.category, CATEGORIES, 'document'),
    date,
    time,
    repeat: oneOf(out.repeat, REPEATS, 'none'),
    remindDaysBefore: toInt(out.remindDaysBefore),
    reference: typeof out.reference === 'string' ? out.reference.trim() : '',
    notes: typeof out.notes === 'string' ? out.notes.trim() : '',
    confidence,
    uncertain: Array.isArray(out.uncertain) ? out.uncertain.filter((u) => typeof u === 'string') : [],
  })
}
