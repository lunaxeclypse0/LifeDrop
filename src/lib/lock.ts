/**
 * Device lock for LifeDrop.
 *
 * The PIN is never stored. What is stored is a PBKDF2-HMAC-SHA256 hash of it
 * with a per-install random salt, so reading the settings record tells an
 * attacker nothing directly. Because a 6-digit PIN only has a million
 * possibilities, the iteration count alone is not the defence — the attempt
 * limiter below is. Both are needed.
 *
 * Scope, stated plainly: this gates the app's UI. It does not encrypt what is
 * in IndexedDB. Someone with developer tools on an unlocked device can still
 * read the raw store. It stops a person who picks up your phone, not a person
 * who owns your laptop.
 */

const ITERATIONS = 310_000
const KEY_BITS = 256
const ATTEMPTS_KEY = 'lifedrop.lockAttempts'
const MAX_FREE_ATTEMPTS = 5

export interface LockConfig {
  enabled: boolean
  salt: string
  hash: string
  iterations: number
  /** WebAuthn credential id, when the user has enrolled Face ID / fingerprint. */
  biometricId: string | null
}

export const NO_LOCK: LockConfig = {
  enabled: false,
  salt: '',
  hash: '',
  iterations: ITERATIONS,
  biometricId: null,
}

// ---------------------------------------------------------------------------
// encoding
// ---------------------------------------------------------------------------

function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

export async function createLock(pin: string, biometricId: string | null = null): Promise<LockConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt, ITERATIONS)
  return {
    enabled: true,
    salt: toB64(salt),
    hash: toB64(hash),
    iterations: ITERATIONS,
    biometricId,
  }
}

/** Length-safe, value-independent comparison. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function verifyPin(pin: string, lock: LockConfig): Promise<boolean> {
  if (!lock.enabled || !lock.hash) return true
  const candidate = await derive(pin, fromB64(lock.salt), lock.iterations || ITERATIONS)
  return sameBytes(candidate, fromB64(lock.hash))
}

// ---------------------------------------------------------------------------
// attempt limiting — the real brake on a short PIN
// ---------------------------------------------------------------------------

interface Attempts {
  failed: number
  until: number
}

function readAttempts(): Attempts {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '') as Attempts
  } catch {
    return { failed: 0, until: 0 }
  }
}

function writeAttempts(a: Attempts) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a))
  } catch {
    /* private mode — the limiter resets, which is the safe direction for the user */
  }
}

/** Seconds still to wait, or 0 when an attempt is allowed right now. */
export function lockoutRemaining(): number {
  const { until } = readAttempts()
  const left = Math.ceil((until - Date.now()) / 1000)
  return left > 0 ? left : 0
}

/** Doubles from 30s after five wrong tries, capped at 15 minutes. */
export function recordFailure(): number {
  const a = readAttempts()
  a.failed += 1
  if (a.failed >= MAX_FREE_ATTEMPTS) {
    const over = a.failed - MAX_FREE_ATTEMPTS
    const wait = Math.min(30_000 * 2 ** over, 15 * 60_000)
    a.until = Date.now() + wait
  }
  writeAttempts(a)
  return lockoutRemaining()
}

export function clearFailures(): void {
  try {
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    /* nothing to clear */
  }
}

export function attemptsLeft(): number {
  return Math.max(0, MAX_FREE_ATTEMPTS - readAttempts().failed)
}

// ---------------------------------------------------------------------------
// biometrics (WebAuthn platform authenticator)
// ---------------------------------------------------------------------------

/**
 * With no server there is no signature to verify against a stored public key,
 * so this is a local gesture gate: the device's own authenticator performs
 * user verification (Face ID, Touch ID, Windows Hello, fingerprint) and we
 * accept its assertion. The PIN remains the thing that is actually checked,
 * and is always offered as a fallback.
 */
export function biometricsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    !!navigator.credentials &&
    window.isSecureContext
  )
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!biometricsSupported()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function enrolBiometric(displayName: string): Promise<string | null> {
  if (!biometricsSupported()) return null
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'LifeDrop' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: displayName || 'LifeDrop',
          displayName: displayName || 'LifeDrop',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    return cred ? toB64(new Uint8Array(cred.rawId)) : null
  } catch {
    return null
  }
}

export async function unlockWithBiometric(credentialId: string): Promise<boolean> {
  if (!biometricsSupported()) return false
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromB64(credentialId) as BufferSource }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!assertion
  } catch {
    return false
  }
}
