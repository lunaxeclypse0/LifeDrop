/**
 * The OpenAI-shaped providers that read a drop when Gemini's free allowance is
 * gone: Groq first because it is free, xAI's Grok after it because it is not.
 *
 * Both speak the same chat-completions dialect, so one implementation covers
 * them and they are given the same prompt Gemini gets — two providers that read
 * bills differently would be worse than one that sometimes refuses.
 *
 * Each is off unless its key is set. Nothing is sent to either on an ordinary
 * scan, and nothing is sent to the paid one while a free one still answers.
 * What would be sent is a photograph of somebody's bill with their account
 * number on it, which is also why neither provider's data-sharing programme
 * belongs anywhere near this app.
 */

export interface Provider {
  readonly name: string
  readonly endpoint: string
  readonly key: string
  readonly model: string
  /** Spends money rather than an allowance. Ordered last, and never reached first. */
  readonly paid: boolean
}

/**
 * Configured providers, free ones first. An unset key is not a
 * misconfiguration — it is the default, and it means that provider is simply
 * not part of the chain.
 */
export function providers(): Provider[] {
  const out: Provider[] = []

  const groq = process.env.GROQ_API_KEY
  if (groq) {
    out.push({
      name: 'groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      key: groq,
      // Groq's vision models change names often; this is an env var for the
      // same reason the Gemini ones are.
      model: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
      paid: false,
    })
  }

  const xai = process.env.XAI_API_KEY || process.env.GROK_API_KEY
  if (xai) {
    out.push({
      name: 'xai',
      endpoint: 'https://api.x.ai/v1/chat/completions',
      key: xai,
      model: process.env.XAI_MODEL || 'grok-4.6',
      paid: true,
    })
  }

  return out
}

const FIELDS = [
  'readable',
  'title',
  'merchant',
  'amount',
  'category',
  'date',
  'time',
  'repeat',
  'remindDaysBefore',
  'reference',
  'notes',
  'confidence',
] as const

/**
 * JSON Schema rather than Gemini's uppercase dialect. `strict` refuses a schema
 * that leaves anything optional, so every field is required and the model
 * writes "" for what it cannot find — which is what the prompt asks for anyway.
 */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...FIELDS, 'uncertain'],
  properties: {
    readable: { type: 'string', enum: ['yes', 'no'] },
    title: { type: 'string' },
    merchant: { type: 'string' },
    amount: { type: 'string', description: 'Digits only, e.g. "1899" or "842.35". Empty if none.' },
    category: {
      type: 'string',
      enum: ['bill', 'receipt', 'booking', 'subscription', 'warranty', 'document', 'event'],
    },
    date: { type: 'string', description: 'yyyy-mm-dd. Empty if none found.' },
    time: { type: 'string', description: 'HH:MM 24-hour. Empty if none.' },
    repeat: {
      type: 'string',
      enum: ['none', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'],
    },
    remindDaysBefore: { type: 'string', description: 'Whole days, e.g. "2". Empty for no reminder.' },
    reference: { type: 'string' },
    notes: { type: 'string' },
    confidence: { type: 'string', description: '0 to 1, e.g. "0.93"' },
    uncertain: { type: 'array', items: { type: 'string' } },
  },
} as const

/**
 * Schema enforcement is uneven across providers and models — strict decoding
 * exists on some, plain schemas on more, and only bare JSON mode everywhere. So
 * the strongest is tried first and the first one the provider accepts is
 * remembered, the same approach `_model.ts` takes with reasoning.
 */
type Format = 'strict' | 'schema' | 'json'
const FORMATS: Format[] = ['strict', 'schema', 'json']
const known: Record<string, Format> = {}

function responseFormat(format: Format): Record<string, unknown> {
  if (format === 'json') return { response_format: { type: 'json_object' } }
  return {
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'extraction', strict: format === 'strict', schema: SCHEMA },
    },
  }
}

/** A 400 naming the response format means this model wants a simpler one. */
async function rejectedFormat(res: Response): Promise<boolean> {
  if (res.status !== 400 && res.status !== 422) return false
  const body = await res.clone().text().catch(() => '')
  return /response_format|json_schema|schema|structured/i.test(body)
}

export type ProviderResult =
  | { ok: true; out: Record<string, unknown> }
  | { ok: false; status: number; detail: string }

export async function readWithProvider(
  provider: Provider,
  prompt: string,
  mime: string,
  base64: string,
): Promise<ProviderResult> {
  const redact = (s: string) => s.split(provider.key).join('[redacted]')

  const call = (format: Format) =>
    fetch(provider.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
        ...responseFormat(format),
      }),
    })

  const cacheKey = `${provider.name}:${provider.model}`
  const remembered = known[cacheKey]
  // What worked last time first, then the rest, so a model that quietly gains
  // or loses strict decoding is absorbed inside one request.
  const ladder = remembered
    ? [remembered, ...FORMATS.filter((f) => f !== remembered)]
    : FORMATS

  let res: Response
  try {
    let i = 0
    res = await call(ladder[0])
    while (i + 1 < ladder.length && (await rejectedFormat(res))) {
      i++
      res = await call(ladder[i])
    }
    if (res.ok) known[cacheKey] = ladder[i]
  } catch {
    return { ok: false, status: 502, detail: `Could not reach ${provider.name}.` }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, detail: redact(await res.text().catch(() => '')) }
  }

  const payload = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
  } | null
  const text = payload?.choices?.[0]?.message?.content
  if (!text?.trim()) {
    return { ok: false, status: 502, detail: `${provider.name} returned nothing.` }
  }

  try {
    return { ok: true, out: JSON.parse(text) as Record<string, unknown> }
  } catch {
    // JSON mode without a schema sometimes wraps the object in prose or a
    // fenced block. One salvage attempt beats losing a good reading.
    const salvaged = /\{[\s\S]*\}/.exec(text)
    if (salvaged) {
      try {
        return { ok: true, out: JSON.parse(salvaged[0]) as Record<string, unknown> }
      } catch {
        /* fall through */
      }
    }
    return { ok: false, status: 502, detail: redact(text.slice(0, 400)) }
  }
}
