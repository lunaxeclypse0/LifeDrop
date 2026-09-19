/**
 * Exercises api/extract.ts without touching Gemini: the upstream call is
 * stubbed, so the parts I can actually get wrong — request handling, status
 * codes, and coercing the model's strings into an Extraction — are covered.
 *
 *   npm run test:api
 */
import handler from '../api/extract'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`, detail ?? '')
  }
}

function post(file?: { name: string; type: string; bytes?: number }, today = '2026-09-19') {
  const form = new FormData()
  if (file) {
    const blob = new Blob([new Uint8Array(file.bytes ?? 2048)], { type: file.type })
    form.append('file', new File([blob], file.name, { type: file.type }))
  }
  form.append('kind', 'upload')
  form.append('today', today)
  return new Request('http://localhost/api/extract', { method: 'POST', body: form })
}

/** Stubs the one outbound call the handler makes. */
function stubGemini(body: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
}

function modelSays(obj: Record<string, unknown>) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }
}

const IMG = { name: 'bill.jpg', type: 'image/jpeg' }

// --- no key on the server -------------------------------------------------
delete process.env.GEMINI_API_KEY
{
  const res = await handler(post(IMG))
  check('503 when GEMINI_API_KEY is unset', res.status === 503, res.status)
  const body = (await res.json()) as { error: string }
  check('  and names the reason', body.error === 'not_configured', body)
}

// The key is accepted under any of the documented aliases.
for (const alias of ['GEMINI_API_KEY', 'API_KEY_LIFEDROP', 'GOOGLE_API_KEY', 'GEMINI_KEY']) {
  for (const k of ['GEMINI_API_KEY', 'API_KEY_LIFEDROP', 'GOOGLE_API_KEY', 'GEMINI_KEY']) {
    delete process.env[k]
  }
  process.env[alias] = 'test-key'
  stubGemini(modelSays({ readable: 'no', title: '', category: 'document', confidence: '0' }))
  const res = await handler(post(IMG))
  check(`key found via ${alias}`, res.status === 422, res.status)
}

process.env.GEMINI_API_KEY = 'test-key'

// --- request shape --------------------------------------------------------
{
  const res = await handler(new Request('http://localhost/api/extract', { method: 'GET' }))
  check('405 on GET', res.status === 405, res.status)
}
{
  const res = await handler(post(undefined))
  check('400 when no file is attached', res.status === 400, res.status)
}
{
  const res = await handler(post({ name: 'notes.txt', type: 'text/plain' }))
  check('422 for a file type that cannot be read', res.status === 422, res.status)
}

// --- the model says it could not read it ----------------------------------
{
  stubGemini(modelSays({ readable: 'no', title: '', category: 'document', confidence: '0' }))
  const res = await handler(post(IMG))
  check('422 when the model reports unreadable', res.status === 422, res.status)
}

// --- a good reading, with everything as strings ---------------------------
{
  stubGemini(
    modelSays({
      readable: 'yes',
      title: 'Internet Bill',
      merchant: 'Globe Fiber',
      amount: '1,899.00',
      category: 'bill',
      date: '2026-09-28',
      time: '',
      repeat: 'monthly',
      remindDaysBefore: '2',
      reference: 'Account ending 4421',
      notes: 'Plan 1899',
      confidence: '0.94',
      uncertain: [],
    }),
  )
  const res = await handler(post(IMG))
  check('200 on a good reading', res.status === 200, res.status)
  const b = (await res.json()) as Record<string, unknown>
  check('  amount "1,899.00" -> 1899', b.amount === 1899, b.amount)
  check('  remindDaysBefore "2" -> 2', b.remindDaysBefore === 2, b.remindDaysBefore)
  check('  confidence "0.94" -> 0.94', b.confidence === 0.94, b.confidence)
  check('  empty time -> null', b.time === null, b.time)
  check('  category passes through', b.category === 'bill', b.category)
  check('  title passes through', b.title === 'Internet Bill', b.title)
}

// --- a sloppy reading must still produce a valid Extraction ---------------
{
  stubGemini(
    modelSays({
      readable: 'yes',
      title: '',
      merchant: '  Meralco  ',
      amount: '',
      category: 'not-a-category',
      date: '28/09/2026',
      time: '25:99',
      repeat: 'fortnightly',
      remindDaysBefore: '',
      confidence: '7',
      uncertain: ['amount', 42],
    }),
  )
  const res = await handler(post(IMG))
  const b = (await res.json()) as Record<string, unknown>
  check('empty title -> a usable fallback', b.title === 'Untitled drop', b.title)
  check('  merchant is trimmed', b.merchant === 'Meralco', b.merchant)
  check('  empty amount -> null', b.amount === null, b.amount)
  check('  bad category -> document', b.category === 'document', b.category)
  check('  bad date -> today, not a crash', b.date === '2026-09-19', b.date)
  check('  out-of-range time -> null', b.time === null, b.time)
  check('  bad repeat -> none', b.repeat === 'none', b.repeat)
  check('  confidence clamped to 1', b.confidence === 1, b.confidence)
  check('  non-string dropped from uncertain', JSON.stringify(b.uncertain) === '["amount"]', b.uncertain)
}

// --- a date that looks right but does not exist ---------------------------
{
  stubGemini(
    modelSays({
      readable: 'yes', title: 'Bill', category: 'bill',
      date: '2026-02-31', time: '08:20', confidence: '0.9',
    }),
  )
  const res = await handler(post(IMG))
  const b = (await res.json()) as Record<string, unknown>
  check('Feb 31 -> falls back to today', b.date === '2026-09-19', b.date)
  check('  valid time is kept', b.time === '08:20', b.time)
}

// --- oversized upload -----------------------------------------------------
{
  const res = await handler(post({ ...IMG, bytes: 5 * 1024 * 1024 }))
  check('413 when the file is over the edge body limit', res.status === 413, res.status)
}

// --- upstream problems ----------------------------------------------------
{
  stubGemini({ error: 'quota' }, 429)
  const res = await handler(post(IMG))
  check('429 is passed through as rate limiting', res.status === 429, res.status)
}
// The client waits a per-minute limit out by itself, so what the server says
// about scope and timing decides whether the user ever sees an error at all.
{
  stubGemini(
    {
      error: {
        code: 429,
        message: 'Quota exceeded for quota metric GenerateRequestsPerMinutePerProject',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '26s' }],
      },
    },
    429,
  )
  const res = await handler(post(IMG))
  const b = (await res.json()) as Record<string, unknown>
  check('a per-minute limit is marked recoverable', b.scope === 'minute', b.scope)
  check("  and carries Google's own retry delay", b.retryAfter === 26, b.retryAfter)
  check('  and sets Retry-After', res.headers.get('retry-after') === '26', res.headers.get('retry-after'))
}
{
  stubGemini(
    { error: { code: 429, message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel' } },
    429,
  )
  const res = await handler(post(IMG))
  const b = (await res.json()) as Record<string, unknown>
  check('a daily limit is marked as such', b.scope === 'day', b.scope)
  check('  and gets no countdown to wait out', b.retryAfter === 0, b.retryAfter)
  check('  and says when it comes back', String(b.message).includes('resets'), b.message)
}
// A 429 body is the one upstream error most likely to be shown to the user,
// so it must not carry the key along with it.
{
  process.env.GEMINI_API_KEY = 'super-secret-key'
  stubGemini({ error: { message: 'API key super-secret-key exceeded quota' } }, 429)
  const res = await handler(post(IMG))
  const raw = await res.text()
  check('never echoes the key back to the browser', !raw.includes('super-secret-key'), raw.slice(0, 120))
  process.env.GEMINI_API_KEY = 'test-key'
}

// --- falling back to a model with its own allowance -----------------------
// The capable flash model is metered in the tens of requests a day. Running out
// of it must not end the day's scanning.
{
  const asked: string[] = []
  globalThis.fetch = (async (url: string) => {
    const model = /models\/([^:]+):/.exec(url)?.[1] ?? '?'
    asked.push(model)
    if (model === 'gemini-3.6-flash') {
      return new Response(
        JSON.stringify({ error: { message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel' } }),
        { status: 429 },
      )
    }
    return new Response(JSON.stringify(modelSays({ readable: 'yes', title: 'Meralco Bill', category: 'bill', amount: '3420', confidence: '0.9' })), { status: 200 })
  }) as unknown as typeof fetch

  const res = await handler(post(IMG))
  check('a used-up daily quota moves to the next model', res.status === 200, res.status)
  check('  and the drop is still read', ((await res.json()) as Record<string, unknown>).amount === 3420)
  check('  after trying the better one first', asked[0] === 'gemini-3.6-flash', asked)
  check('  and the fallback has its own allowance', asked.includes('gemini-3.5-flash-lite'), asked)
}
{
  // Both gone is a real dead end, and must still read as a limit, not a crash.
  stubGemini({ error: { message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel' } }, 429)
  const res = await handler(post(IMG))
  check('both models out -> still an honest 429', res.status === 429, res.status)
  check('  marked as the daily one', ((await res.json()) as Record<string, unknown>).scope === 'day')
}
{
  // A retired primary should not take the app down with it.
  let calls = 0
  globalThis.fetch = (async (url: string) => {
    calls++
    if (/gemini-3\.6-flash/.test(url)) {
      return new Response(JSON.stringify({ error: { code: 404, message: 'not found' } }), { status: 404 })
    }
    return new Response(JSON.stringify(modelSays({ readable: 'yes', title: 'Bill', category: 'bill', confidence: '0.9' })), { status: 200 })
  }) as unknown as typeof fetch
  const res = await handler(post(IMG))
  check('a retired primary falls through instead of failing', res.status === 200, res.status)
  check('  having actually tried both', calls >= 2, calls)
}
{
  // One model named for both means one attempt, not two identical ones.
  process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash'
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response(JSON.stringify({ error: 'quota' }), { status: 429 })
  }) as typeof fetch
  await handler(post(IMG))
  check('the same model twice is not tried twice', calls === 1, calls)
  delete process.env.GEMINI_FALLBACK_MODEL
}

// --- thinking, which is what made a scan slow -----------------------------
// The setting is spelled differently across model generations. Getting this
// wrong is a hard 400, so the handler probes rather than assuming.
{
  const sent: string[] = []
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { generationConfig: Record<string, unknown> }
    const cfg = (body.generationConfig.thinkingConfig ?? {}) as Record<string, unknown>
    sent.push('thinkingLevel' in cfg ? 'level' : 'thinkingBudget' in cfg ? 'budget' : 'none')
    if ('thinkingLevel' in cfg) {
      return new Response(JSON.stringify({ error: { message: 'Unknown name "thinkingLevel"' } }), {
        status: 400,
      })
    }
    return new Response(JSON.stringify(modelSays({ readable: 'yes', title: 'Bill', category: 'bill', confidence: '0.9' })), { status: 200 })
  }) as unknown as typeof fetch

  const res = await handler(post(IMG))
  check('a rejected thinking setting falls through to the next', res.status === 200, res.status)
  check('  without a wasted scan for the user', sent.includes('budget'), sent)
}
{
  // A reasoning model returns its thoughts as a separate part; taking part
  // zero would hand JSON.parse a paragraph of English.
  stubGemini({
    candidates: [
      {
        content: {
          parts: [
            { text: 'Let me look at the total line...', thought: true },
            { text: JSON.stringify({ readable: 'yes', title: 'Meralco Bill', category: 'bill', amount: '3420.50', confidence: '0.95' }) },
          ],
        },
      },
    ],
  })
  const res = await handler(post(IMG))
  const b = (await res.json()) as Record<string, unknown>
  check('the model’s reasoning is not mistaken for its answer', b.title === 'Meralco Bill', b)
  check('  and the amount still survives', b.amount === 3420.5, b.amount)
}
{
  stubGemini({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })
  const res = await handler(post(IMG))
  const b = (await res.json()) as Record<string, unknown>
  check('a truncated answer says so instead of "returned nothing"', String(b.message).includes('ran out of room'), b)
}
{
  stubGemini({ error: { code: 404, message: 'no longer available' } }, 404)
  const res = await handler(post(IMG))
  const b = (await res.json()) as Record<string, unknown>
  check('retired model -> a message naming the fix', b.error === 'model_unavailable', b)
  check('  and names the model tried', String(b.message).includes('gemini-3.6-flash'), b.message)
}
{
  stubGemini({ error: 'boom' }, 500)
  const res = await handler(post(IMG))
  check('upstream 500 -> 502', res.status === 502, res.status)
}
{
  globalThis.fetch = (async () => {
    throw new Error('network down')
  }) as typeof fetch
  const res = await handler(post(IMG))
  check('network failure -> 502', res.status === 502, res.status)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
