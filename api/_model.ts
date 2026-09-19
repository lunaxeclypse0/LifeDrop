/**
 * Shared by /api/extract and /api/voice. Vercel ignores files in `api/` whose
 * name starts with an underscore, so this is a module, not a route.
 *
 * Both endpoints call the same model through the same free tier, so the two
 * things that decide whether the app feels fast or broken — how long the model
 * thinks, and what a quota refusal actually means — belong in one place.
 */

/**
 * Reading a bill or routing a sentence is a lookup, not a puzzle. Current
 * Gemini models reason before answering by default, which adds seconds to
 * every request for no gain here, so it is turned down.
 *
 * That setting has been spelled two ways across model generations, and sending
 * the wrong one is a hard 400. Rather than pin a spelling that will rot, the
 * first call tries them in turn and remembers what the model accepted; a warm
 * instance pays nothing after that, and a rejected call fails fast.
 */
export type ThinkMode = 'level' | 'budget' | 'none'
export const THINK_MODES: ThinkMode[] = ['level', 'budget', 'none']

export function thinkingConfig(mode: ThinkMode): Record<string, unknown> {
  if (mode === 'level') return { thinkingConfig: { thinkingLevel: 'low' } }
  if (mode === 'budget') return { thinkingConfig: { thinkingBudget: 0 } }
  return {}
}

/** A 400 that names the thinking field means this model spells it differently. */
export async function rejectedThinking(res: Response): Promise<boolean> {
  if (res.status !== 400) return false
  const body = await res.clone().text().catch(() => '')
  return /thinking/i.test(body)
}

/**
 * Runs `call` against each spelling until one is not rejected for that reason,
 * and remembers the winner through `remember` so later requests go straight to
 * it. Returns whatever the model answered — including an error that has
 * nothing to do with thinking.
 */
export async function callWithThinking(
  call: (mode: ThinkMode) => Promise<Response>,
  known: ThinkMode | null,
  remember: (mode: ThinkMode) => void,
): Promise<Response> {
  // What worked last time first, then the rest. A model swapped underneath us
  // is then absorbed inside one request, rather than costing the user a failed
  // scan before the next one re-probes.
  const ladder = known ? [known, ...THINK_MODES.filter((m) => m !== known)] : THINK_MODES

  let i = 0
  let res = await call(ladder[0])
  while (i + 1 < ladder.length && (await rejectedThinking(res))) {
    i++
    res = await call(ladder[i])
  }

  if (res.ok) remember(ladder[i])
  return res
}

/**
 * Which models to try, in order.
 *
 * Free-tier daily allowances differ enormously between models — the capable
 * flash model is metered in the tens of requests a day, while the lite one is
 * in the hundreds, and the two quotas are counted separately. So the good model
 * reads the first drops of the day and the generous one takes over when it runs
 * out, which is better than either choice alone: no wall, and no needless drop
 * in quality before the wall would have been.
 *
 * Both are overridable, because model ids get retired and the list is the value
 * here most likely to go stale.
 */
export function modelChain(): string[] {
  const primary = process.env.GEMINI_MODEL || 'gemini-3.6-flash'
  const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite'
  return primary === fallback ? [primary] : [primary, fallback]
}

/** Worth trying the next model for: this one is out of quota, or is gone. */
export function worthFallingBack(status: number): boolean {
  return status === 429 || status === 404
}

/**
 * Google answers 429 with the quota that was hit and how long to wait. Passing
 * that through is the difference between "try again in 26 seconds" and a dead
 * end — a per-minute cap clears itself, a daily one does not.
 */
export function readLimit(body: string): { scope: 'minute' | 'day'; retryAfter: number } {
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body)
  const perDay = /PerDay|per_day|RequestsPerDay/i.test(body)
  return {
    scope: perDay ? 'day' : 'minute',
    // Google's own suggestion when it gives one, otherwise a minute for a
    // per-minute window. A daily cap gets no countdown worth showing.
    retryAfter: delay ? Math.ceil(Number(delay[1])) : perDay ? 0 : 45,
  }
}

export function limitResponse(detail: string): Response {
  const { scope, retryAfter } = readLimit(detail)
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      scope,
      retryAfter,
      message:
        scope === 'day'
          ? "Today's free allowance for this model is used up. It resets at midnight Pacific time."
          : 'The free tier allows only a few reads a minute.',
      detail: detail.slice(0, 400),
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}),
      },
    },
  )
}

/**
 * The model's answer, minus its reasoning. Parts arrive as a list and a
 * reasoning model puts its thoughts in one of them — flagged, and never the
 * JSON — so the answer cannot be assumed to sit at index zero.
 */
export interface Candidate {
  finishReason?: string
  content?: { parts?: { text?: string; thought?: boolean }[] }
}

export function answerText(candidate: Candidate | undefined): string {
  return (
    candidate?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('') ?? ''
  )
}
