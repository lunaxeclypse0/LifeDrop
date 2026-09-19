/**
 * Covers api/signup.ts with the Supabase admin API stubbed.
 *
 *   npm run test:signup
 */
import handler from '../api/signup'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}`, detail ?? '') }
}

const post = (body: unknown) =>
  new Request('http://localhost/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

interface Call { url: string; body: Record<string, unknown> }
// An array, because a `let` assigned only inside the fetch stub gets narrowed
// to `never` at every read site.
const calls: Call[] = []
const lastCall = () => calls[calls.length - 1] as Call | undefined

function stub(status: number, text = '') {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
    return new Response(text, { status })
  }) as typeof fetch
}

// --- not configured ---------------------------------------------------------
delete process.env.SUPABASE_URL
delete process.env.VITE_SUPABASE_URL
delete process.env.SUPABASE_SECRET_KEY
delete process.env.SUPABASE_SERVICE_ROLE_KEY
check('503 without a secret key', (await handler(post({ username: 'lance', password: 'abcd1234' }))).status === 503)

process.env.SUPABASE_URL = 'https://demo.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'

// --- validation, re-checked on the server -----------------------------------
check('rejects a short username', (await handler(post({ username: 'ab', password: 'abcd1234' }))).status === 400)
check('rejects spaces', (await handler(post({ username: 'lance reyes', password: 'abcd1234' }))).status === 400)
check('rejects a leading dot', (await handler(post({ username: '.lance', password: 'abcd1234' }))).status === 400)
check('rejects a short password', (await handler(post({ username: 'lance', password: 'abc' }))).status === 400)
check('405 on GET', (await handler(new Request('http://localhost/api/signup', { method: 'GET' }))).status === 405)

// --- the happy path ---------------------------------------------------------
{
  stub(200, '{"id":"abc"}')
  const res = await handler(post({ username: '  LANCE  ', password: 'abcd1234' }))
  check('200 on success', res.status === 200, res.status)
  check('  calls the admin endpoint', !!lastCall()?.url.endsWith('/auth/v1/admin/users'), lastCall()?.url)
  check('  folds the username to lowercase', lastCall()?.body.email === 'lance@lifedrop.invalid', lastCall()?.body.email)
  check('  asks for a confirmed account', lastCall()?.body.email_confirm === true, lastCall()?.body.email_confirm)
  check('  keeps the username in metadata',
    (lastCall()?.body.user_metadata as { username?: string })?.username === 'lance')
}

// --- failures the user should understand ------------------------------------
{
  stub(422, '{"msg":"A user with this email address has already been registered"}')
  const res = await handler(post({ username: 'lance', password: 'abcd1234' }))
  const b = (await res.json()) as { error: string; message: string }
  check('409 when the username is taken', res.status === 409, res.status)
  check('  says so in the user\'s own terms', /taken/i.test(b.message), b.message)
}
{
  stub(401, 'unauthorized')
  const res = await handler(post({ username: 'lance', password: 'abcd1234' }))
  const b = (await res.json()) as { message: string }
  check('names the bad key rather than blaming the user', /SUPABASE_SECRET_KEY/.test(b.message), b.message)
}
{
  globalThis.fetch = (async () => { throw new Error('offline') }) as typeof fetch
  check('502 when the service is unreachable',
    (await handler(post({ username: 'lance', password: 'abcd1234' }))).status === 502)
}

// The secret must never be echoed back to the caller.
{
  stub(500, 'boom sb_secret_test leaked')
  const res = await handler(post({ username: 'lance', password: 'abcd1234' }))
  const text = JSON.stringify(await res.json())
  check('never echoes the secret key back', !text.includes('sb_secret_test'), text)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
