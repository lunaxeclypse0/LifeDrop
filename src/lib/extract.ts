import type { Category, DropSource, Extraction, Repeat } from './types'
import { toISO } from './format'
import { downscaleForUpload } from './image'

/**
 * Everything the app knows about "reading a drop" goes through this one
 * interface. Swapping the mock for a real model is a one-line change in
 * `getExtractor()` — no screen imports an implementation directly.
 */
export interface Extractor {
  readonly name: string
  /**
   * @param source   the captured photo or picked file
   * @param onStep   0-4, matching the five processing captions
   * @param signal   aborts when the user backs out of Processing
   */
  extract(source: DropSource, onStep?: (step: number) => void, signal?: AbortSignal): Promise<Extraction>
}

/** Below this, the drop is filed with "Needs review". */
export const REVIEW_THRESHOLD = 0.82

export class UnreadableDropError extends Error {
  constructor(message = 'We could not read this drop.') {
    super(message)
    this.name = 'UnreadableDropError'
  }
}

/** The backend is reachable but has no model key, so nothing can be read yet. */
export class ExtractorNotConfiguredError extends Error {
  constructor(message = 'AI extraction is not set up on the server yet.') {
    super(message)
    this.name = 'ExtractorNotConfiguredError'
  }
}

/** The free tier's limit was hit. Waiting actually helps, so say so. */
export class RateLimitedError extends Error {
  constructor(message = 'The AI free limit was reached. Try again in a minute.') {
    super(message)
    this.name = 'RateLimitedError'
  }
}

// ---------------------------------------------------------------------------
// Mock extractor
// ---------------------------------------------------------------------------

interface Template {
  title: string
  merchant: string
  amount: number | null
  category: Category
  /** Days from today the extracted date lands on. */
  offset: number
  time?: string
  repeat: Repeat
  remind: number | null
  reference: string
  notes: string
}

const TEMPLATES: Template[] = [
  { title: 'Internet Bill', merchant: 'Globe Fiber', amount: 1899, category: 'bill', offset: 9, repeat: 'monthly', remind: 2, reference: 'Account ending 4421', notes: 'Plan 1899 · unlimited' },
  { title: 'Electricity Bill', merchant: 'Meralco', amount: 3420, category: 'bill', offset: 11, repeat: 'monthly', remind: 3, reference: 'Customer no. 9021-4417', notes: 'Billing period Aug 15 – Sep 14' },
  { title: 'Water Bill', merchant: 'Maynilad', amount: 748.5, category: 'bill', offset: 14, repeat: 'monthly', remind: 3, reference: 'Contract no. 55-2210', notes: '' },
  { title: 'Netflix', merchant: 'Netflix · Standard', amount: 549, category: 'subscription', offset: 12, repeat: 'monthly', remind: 1, reference: 'Card ending 8812', notes: '' },
  { title: 'Spotify Premium', merchant: 'Spotify · Duo', amount: 194, category: 'subscription', offset: 19, repeat: 'monthly', remind: 1, reference: 'Card ending 8812', notes: '' },
  { title: 'Grab Receipt', merchant: 'BGC → Ortigas', amount: 318, category: 'receipt', offset: -3, repeat: 'none', remind: null, reference: 'Trip ID 88-2201', notes: '' },
  { title: 'Mercury Drug', merchant: 'Ayala Malls', amount: 842.35, category: 'receipt', offset: -2, repeat: 'none', remind: null, reference: 'Ref. 7741-0093', notes: '' },
  { title: 'Nike Receipt', merchant: 'Nike Park BGC', amount: 4295, category: 'receipt', offset: -1, repeat: 'none', remind: null, reference: 'Ref. 0091-2284', notes: '' },
  { title: 'Cebu Pacific Flight', merchant: 'MNL → CEB · 5J 561', amount: null, category: 'booking', offset: 14, time: '08:20', repeat: 'none', remind: 1, reference: 'Booking ref. QK7T2M', notes: 'Check-in opens 24h before' },
  { title: 'Hotel Booking', merchant: 'Seda Ayala · 2 nights', amount: 8400, category: 'booking', offset: 21, time: '14:00', repeat: 'none', remind: 1, reference: 'Confirmation 4471-B', notes: '' },
  { title: 'Dentist Appointment', merchant: 'Dr. Reyes · Makati Dental', amount: null, category: 'event', offset: 4, time: '15:30', repeat: 'semiannual', remind: 1, reference: 'Clinic 8F, Unit 803', notes: '' },
  { title: 'Parent-Teacher Meeting', merchant: 'St. Scholastica · Grade 4', amount: null, category: 'event', offset: 6, time: '17:00', repeat: 'none', remind: 1, reference: 'Room 204', notes: '' },
  { title: 'Air Fryer Warranty', merchant: 'Kyowa', amount: null, category: 'warranty', offset: 480, repeat: 'none', remind: 30, reference: 'Serial KY-4471-A', notes: 'Purchased Jan 12' },
  { title: 'Passport', merchant: 'DFA Manila', amount: null, category: 'document', offset: 1730, repeat: 'none', remind: 90, reference: 'P-series · ends 4402', notes: '' },
]

/** Filename hints beat the round-robin — dropping "meralco.pdf" should read as Meralco. */
const HINTS: [RegExp, number][] = [
  [/globe|internet|fiber/i, 0],
  [/meralco|electric/i, 1],
  [/maynilad|water/i, 2],
  [/netflix/i, 3],
  [/spotify/i, 4],
  [/grab/i, 5],
  [/mercury|pharmacy/i, 6],
  [/nike|receipt/i, 7],
  [/cebu|5j|flight|airline|boarding/i, 8],
  [/hotel|seda|booking/i, 9],
  [/dentist|clinic|appointment/i, 10],
  [/school|meeting|ptm/i, 11],
  [/warranty/i, 12],
  [/passport|dfa/i, 13],
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function plusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toISO(d)
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })

/**
 * Stands in for the model until a real one is wired up. Picks a plausible
 * Philippine-merchant reading from the file name, paced to the five
 * processing captions in design/motion-spec.md.
 */
export class MockExtractor implements Extractor {
  readonly name = 'mock'

  constructor(private stepMs = 620) {}

  async extract(source: DropSource, onStep?: (step: number) => void, signal?: AbortSignal): Promise<Extraction> {
    const key = `${source.file.name}:${source.file.size}`
    const seed = hash(key)

    // "Unreadable" is a real state the UI has to handle — a tiny or empty
    // file is the one case the mock refuses, so the path stays reachable.
    if (source.file.size > 0 && source.file.size < 1024 && source.kind !== 'manual') {
      await sleep(this.stepMs * 2, signal)
      throw new UnreadableDropError()
    }

    const hinted = HINTS.find(([re]) => re.test(source.file.name))
    const tpl = TEMPLATES[hinted ? hinted[1] : seed % TEMPLATES.length]

    for (let step = 0; step <= 4; step++) {
      onStep?.(step)
      if (step < 4) await sleep(this.stepMs, signal)
    }

    // Without a hint the mock is honest about being unsure, so drops land in
    // "Needs review" often enough for that flow to matter.
    const confidence = hinted ? 0.94 : 0.62 + (seed % 30) / 100
    const uncertain = confidence < REVIEW_THRESHOLD ? ['amount', 'date'] : []

    return {
      title: tpl.title,
      merchant: tpl.merchant,
      amount: tpl.amount,
      category: tpl.category,
      date: plusDays(tpl.offset),
      time: tpl.time ?? null,
      repeat: tpl.repeat,
      remindDaysBefore: tpl.remind,
      reference: tpl.reference,
      notes: tpl.notes,
      confidence,
      uncertain,
    }
  }
}

// ---------------------------------------------------------------------------
// Real extractor — wired, off by default
// ---------------------------------------------------------------------------

/**
 * Posts the drop to a backend that calls a vision model and returns an
 * `Extraction`. `api/extract.ts` in this repo is that backend, running on
 * Vercel against Gemini. Set `VITE_EXTRACT_ENDPOINT=/api/extract` to switch
 * over; without it the mock is used, so a misconfigured deploy degrades to a
 * working app rather than a broken one. The key lives on the server, never in
 * this bundle.
 */
export class HttpExtractor implements Extractor {
  readonly name = 'http'

  constructor(private endpoint: string) {}

  async extract(source: DropSource, onStep?: (step: number) => void, signal?: AbortSignal): Promise<Extraction> {
    onStep?.(0)

    // Shrink before it leaves the device — faster upload, smaller share of
    // the model's free quota, and inside the serverless body limit.
    const upload = await downscaleForUpload(source.file)

    const body = new FormData()
    body.append('file', upload)
    body.append('kind', source.kind)
    body.append('today', toISO(new Date()))

    onStep?.(1)
    const res = await fetch(this.endpoint, { method: 'POST', body, signal })
    if (res.status === 422) throw new UnreadableDropError()
    if (res.status === 503) throw new ExtractorNotConfiguredError()
    if (res.status === 429) throw new RateLimitedError()
    if (!res.ok) throw new Error(`Extraction failed (${res.status})`)

    onStep?.(3)
    const data = (await res.json()) as Partial<Extraction>
    onStep?.(4)

    return {
      title: data.title || 'Untitled drop',
      merchant: data.merchant || '',
      amount: typeof data.amount === 'number' ? data.amount : null,
      category: (data.category as Category) || 'document',
      date: data.date || toISO(new Date()),
      time: data.time ?? null,
      repeat: (data.repeat as Repeat) || 'none',
      remindDaysBefore: data.remindDaysBefore ?? null,
      reference: data.reference || '',
      notes: data.notes || '',
      confidence: data.confidence ?? 0.9,
      uncertain: data.uncertain || [],
    }
  }
}

let extractor: Extractor | null = null

export function getExtractor(): Extractor {
  if (!extractor) {
    const endpoint = import.meta.env.VITE_EXTRACT_ENDPOINT as string | undefined
    extractor = endpoint ? new HttpExtractor(endpoint) : new MockExtractor()
  }
  return extractor
}

/** Lets tests and the dev console swap the implementation. */
export function setExtractor(next: Extractor): void {
  extractor = next
}
