/**
 * POST /api/signup — creates a username account, already confirmed.
 *
 * Supabase's own sign-up honours the project's "Confirm email" setting, which
 * cannot work here: a username maps to a `.invalid` address that no message can
 * ever reach, so the account would stay unconfirmed forever and the free tier's
 * email rate limit would jam after a few attempts.
 *
 * The admin API can create a user with `email_confirm: true` and skip all of
 * that, but it needs the secret key — which is why this runs on the server and
 * never in the browser. The client signs in normally afterwards.
 *
 * Env:
 *   SUPABASE_URL          or VITE_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   or SUPABASE_SERVICE_ROLE_KEY   (server-only, never VITE_)
 */

export const config = { runtime: 'edge' }

const DOMAIN = 'lifedrop.invalid' // must match src/lib/username.ts
const USERNAME_MIN = 3
const USERNAME_MAX = 20
const PASSWORD_MIN = 8

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Same rules as the client, enforced again here — the client can be bypassed. */
function badUsername(name: string): string | null {
  if (name.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters.`
  if (name.length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters.`
  if (!/^[a-z0-9._-]+$/.test(name)) return 'Username has characters that are not allowed.'
  if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) {
    return 'Username must start and end with a letter or a number.'
  }
  if (/[._-]{2,}/.test(name)) return 'Username cannot have two symbols in a row.'
  return null
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !secret) {
    return json(
      {
        error: 'not_configured',
        message: 'Sign-up is not set up on the server. SUPABASE_SECRET_KEY is missing.',
      },
      503,
    )
  }

  let username = ''
  let password = ''
  try {
    const body = (await request.json()) as { username?: string; password?: string }
    username = String(body.username ?? '').trim().toLowerCase()
    password = String(body.password ?? '')
  } catch {
    return json({ error: 'bad_request', message: 'Expected JSON.' }, 400)
  }

  const problem = badUsername(username)
  if (problem) return json({ error: 'invalid_username', message: problem }, 400)
  if (password.length < PASSWORD_MIN) {
    return json(
      { error: 'weak_password', message: `Password must be at least ${PASSWORD_MIN} characters.` },
      400,
    )
  }

  let res: Response
  try {
    res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: secret,
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        email: `${username}@${DOMAIN}`,
        password,
        // The whole point: no confirmation mail, usable immediately.
        email_confirm: true,
        user_metadata: { username },
      }),
    })
  } catch {
    return json({ error: 'upstream_unreachable', message: 'Could not reach the account service.' }, 502)
  }

  if (res.ok) return json({ ok: true, username })

  // Upstream error bodies are relayed for debugging, so make sure the key can
  // never ride along in one. A test caught exactly that.
  const raw = await res.text().catch(() => '')
  const detail = raw.split(secret).join('[redacted]').slice(0, 300)

  if (/already been registered|already exists|duplicate/i.test(raw)) {
    return json({ error: 'taken', message: 'That username is taken. Try another.' }, 409)
  }
  if (res.status === 401 || res.status === 403) {
    return json(
      {
        error: 'bad_secret',
        message: 'The server key was rejected. Check SUPABASE_SECRET_KEY in Vercel.',
      },
      502,
    )
  }
  return json({ error: 'upstream_error', status: res.status, detail }, 502)
}
