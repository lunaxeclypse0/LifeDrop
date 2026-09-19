/**
 * Two readings of the same drop, turned into one.
 *
 * Reading a bill wrong is worse than failing to read it: a missed due date
 * costs money quietly, and nothing on the Review screen tells the user which
 * numbers to distrust. Two models reading the same image independently fixes
 * exactly that — not by being cleverer, but by disagreeing out loud.
 *
 * So this does three things, in order of how much they matter:
 *
 * - **Conflict.** Both found an amount and they differ: that is the case worth
 *   catching. Confidence drops below the review threshold and the field is
 *   named, so the drop arrives flagged instead of silently wrong.
 * - **Gap.** One found a field the other missed. Fill it in, but mark it —
 *   a value only one model saw has not been checked by anything.
 * - **Agreement.** Both read the same amount and the same date. Two
 *   independent readings of a printed number agreeing is real evidence, so
 *   confidence goes up.
 *
 * The primary reading wins every tie. It comes from the stronger model, and
 * this is a cross-check, not a vote.
 */

/** What the caller wants to know about the two readings. */
export interface Reconciled {
  out: Record<string, unknown>
  agreed: string[]
  conflicted: string[]
  filled: string[]
}

/** Below the client's REVIEW_THRESHOLD, so a conflict always gets looked at. */
const ON_CONFLICT = 0.5
/** Also below it: a value only one model saw is not a checked value. */
const ON_FILL = 0.7
/** Two independent readings of the same printed number. */
const ON_AGREE = 0.92

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function num(v: unknown): number | null {
  const s = str(v).replace(/[^\d.]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "Meralco Manila" and "MERALCO" are the same merchant; "Globe" is not. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (field === 'amount') {
    const x = num(a)
    const y = num(b)
    // Centavos rounding differs between models often enough to matter.
    return x !== null && y !== null && Math.abs(x - y) < 0.01
  }
  if (field === 'merchant') return sameName(str(a), str(b))
  return str(a).toLowerCase() === str(b).toLowerCase()
}

/** Compared in full; only the first two move confidence. */
const CRITICAL = ['amount', 'date'] as const
const COMPARED = ['amount', 'date', 'merchant', 'category', 'time', 'repeat', 'reference'] as const

export function reconcile(
  primary: Record<string, unknown>,
  second: Record<string, unknown>,
): Reconciled {
  const out: Record<string, unknown> = { ...primary }
  const agreed: string[] = []
  const conflicted: string[] = []
  const filled: string[] = []

  for (const field of COMPARED) {
    const a = str(primary[field])
    const b = str(second[field])

    if (!a && b) {
      out[field] = second[field]
      filled.push(field)
    } else if (a && b) {
      if (sameValue(field, a, b)) agreed.push(field)
      else conflicted.push(field)
    }
  }

  // A model that could not read the document at all is not a dissenting
  // opinion, so its silence never drags a good reading down.
  const secondRead = str(second.readable) !== 'no'

  const base = num(primary.confidence) ?? 0.8
  let confidence = base

  if (secondRead) {
    const criticalConflict = conflicted.some((f) => (CRITICAL as readonly string[]).includes(f))
    const criticalFilled = filled.some((f) => (CRITICAL as readonly string[]).includes(f))
    const criticalAgreed = CRITICAL.every((f) => agreed.includes(f))

    if (criticalConflict) confidence = Math.min(base, ON_CONFLICT)
    else if (criticalFilled) confidence = Math.min(base, ON_FILL)
    else if (criticalAgreed) confidence = Math.max(base, ON_AGREE)
  }

  out.confidence = String(confidence)

  // Everything the user should look at twice, without duplicates.
  const flagged = [...conflicted, ...filled]
  const existing = Array.isArray(primary.uncertain)
    ? primary.uncertain.filter((u): u is string => typeof u === 'string')
    : []
  out.uncertain = [...new Set([...existing, ...flagged])]

  return { out, agreed, conflicted, filled }
}
