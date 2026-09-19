/**
 * Usernames on top of Supabase Auth.
 *
 * Supabase signs people in with an email and a password; there is no
 * username-only mode. So a username is mapped to a synthetic address and that
 * is what is stored. Uniqueness comes free — Supabase already refuses a
 * duplicate email, which makes it refuse a duplicate username.
 *
 * The domain is `.invalid`, which RFC 6761 reserves and guarantees can never
 * resolve. Nothing sent to it can reach a real inbox, which matters because a
 * real-looking domain would eventually deliver somebody's password reset to a
 * stranger.
 *
 * DO NOT CHANGE THIS DOMAIN once anyone has signed up. It is part of how their
 * account is looked up; changing it locks every existing user out.
 */
const DOMAIN = 'lifedrop.invalid'

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

/** Lowercase, trimmed — so "Lance", " lance " and "LANCE" are one account. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function usernameToEmail(raw: string): string {
  return `${normalizeUsername(raw)}@${DOMAIN}`
}

/** The username back out of a stored address, for display. */
export function emailToUsername(email: string): string {
  return email.endsWith(`@${DOMAIN}`) ? email.slice(0, -(DOMAIN.length + 1)) : email
}

/** True when this account was made with a username rather than a real email. */
export function isUsernameAccount(email: string | undefined): boolean {
  return !!email && email.endsWith(`@${DOMAIN}`)
}

/** Null when fine, otherwise the reason to show under the field. */
export function validateUsername(raw: string): string | null {
  const name = normalizeUsername(raw)
  if (name.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`
  if (name.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`
  // Letters, digits, dot, underscore and hyphen keep the synthetic address
  // valid and keep usernames readable.
  if (!/^[a-z0-9._-]+$/.test(name)) return 'Letters, numbers, dots, dashes and underscores only.'
  if (!/^[a-z0-9]/.test(name)) return 'Start with a letter or a number.'
  if (!/[a-z0-9]$/.test(name)) return 'End with a letter or a number.'
  if (/[._-]{2,}/.test(name)) return 'No two symbols in a row.'
  return null
}
