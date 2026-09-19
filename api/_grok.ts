/**
 * xAI's Grok as a last resort for reading a drop.
 *
 * This exists because Gemini's free allowances are small enough to run out in a
 * single afternoon. Grok has no free tier — it spends the account's credit —
 * so it is **off unless `XAI_API_KEY` is set**, and even then it is only reached
 * after every free model has refused. Nothing is sent here on an ordinary scan.
 *
 * That matters more than usual for this app: what would be sent is a photograph
 * of somebody's bill, with their account number on it. Anyone enabling this
 * should keep xAI's data-sharing programme off — it is permanent, and it trains
 * on the requests.
 *
 * The API is OpenAI-shaped, so the schema below is JSON Schema rather than
 * Gemini's uppercase dialect. Both return the same flat all-string object, and
 * api/extract.ts coerces either one the same way.
 */

const DEFAULT_MODEL = 'grok-4.6'

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
 * `strict: true` refuses a schema that leaves anything optional, so every field
 * is required and the model writes "" for the ones it cannot find — which is
 * what the prompt asks for anyway.
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

export type GrokResult =
  | { ok: true; out: Record<string, unknown> }
  | { ok: false; status: number; detail: string }

/**
 * @param prompt the same instructions Gemini is given — one prompt, so the two
 *               providers cannot drift into reading bills differently.
 */
export async function readWithGrok(
  key: string,
  prompt: string,
  mime: string,
  base64: string,
): Promise<GrokResult> {
  const model = process.env.XAI_MODEL || DEFAULT_MODEL

  let res: Response
  try {
    res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
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
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'extraction', strict: true, schema: SCHEMA },
        },
      }),
    })
  } catch {
    return { ok: false, status: 502, detail: 'Could not reach xAI.' }
  }

  // Never let the key travel back out in a relayed upstream error.
  const redact = (s: string) => s.split(key).join('[redacted]')

  if (!res.ok) {
    return { ok: false, status: res.status, detail: redact(await res.text().catch(() => '')) }
  }

  const payload = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
  } | null
  const text = payload?.choices?.[0]?.message?.content
  if (!text?.trim()) return { ok: false, status: 502, detail: 'xAI returned nothing.' }

  try {
    return { ok: true, out: JSON.parse(text) as Record<string, unknown> }
  } catch {
    return { ok: false, status: 502, detail: redact(text.slice(0, 400)) }
  }
}
