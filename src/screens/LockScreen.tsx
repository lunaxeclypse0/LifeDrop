import { useCallback, useEffect, useState } from 'react'
import { DropMark } from '../components/Brand'
import { PinDots, PinPad, PIN_LENGTH } from '../components/PinPad'
import { useApp } from '../lib/store'
import {
  attemptsLeft,
  lockoutRemaining,
  recordFailure,
  unlockWithBiometric,
  verifyPin,
} from '../lib/lock'

export function LockScreen() {
  const lock = useApp((s) => s.settings.lock)
  const setUnlocked = useApp((s) => s.setUnlocked)

  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(lockoutRemaining())
  const [busy, setBusy] = useState(false)

  // Count the lockout down so the user is not left guessing.
  useEffect(() => {
    if (wait <= 0) return
    const t = setInterval(() => setWait(lockoutRemaining()), 1000)
    return () => clearInterval(t)
  }, [wait])

  const tryBiometric = useCallback(async () => {
    if (!lock.biometricId || busy) return
    setBusy(true)
    const ok = await unlockWithBiometric(lock.biometricId)
    setBusy(false)
    if (ok) setUnlocked(true)
    else setError('That did not match. Use your PIN.')
  }, [lock.biometricId, busy, setUnlocked])

  // Offer the passkey prompt straight away — that is the fast path.
  useEffect(() => {
    if (lock.biometricId && lockoutRemaining() === 0) void tryBiometric()
    // Only on mount; re-prompting on every render would trap the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = useCallback(
    async (candidate: string) => {
      if (wait > 0 || busy) return
      setBusy(true)
      const ok = await verifyPin(candidate, lock)
      setBusy(false)

      if (ok) {
        setUnlocked(true)
        return
      }

      const left = recordFailure()
      setPin('')
      setWait(left)
      navigator.vibrate?.([20, 60, 20])
      const remaining = attemptsLeft()
      setError(
        left > 0
          ? `Too many tries. Wait ${left}s.`
          : remaining <= 2
            ? `Wrong PIN. ${remaining} ${remaining === 1 ? 'try' : 'tries'} before a pause.`
            : 'Wrong PIN.',
      )
    },
    [lock, wait, busy, setUnlocked],
  )

  const change = (next: string) => {
    setError(null)
    setPin(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  return (
    <div className="screen lockscreen">
      <div className="lock-top">
        <DropMark size={54} />
        <h1 className="display" style={{ fontSize: 21, margin: '18px 0 5px' }}>
          LifeDrop is locked
        </h1>
        <p className="body2" style={{ margin: 0, fontSize: 13.5, minHeight: 20 }}>
          {error ?? 'Enter your PIN to open your vault.'}
        </p>

        <div style={{ marginTop: 22 }}>
          <PinDots length={PIN_LENGTH} filled={pin.length} error={!!error} />
        </div>
      </div>

      <PinPad
        value={pin}
        onChange={change}
        onSubmit={() => pin.length >= 4 && void submit(pin)}
        disabled={wait > 0 || busy}
        onBiometric={lock.biometricId ? () => void tryBiometric() : undefined}
      />

      {wait > 0 && (
        <p className="caption" style={{ textAlign: 'center', marginTop: 4 }}>
          Locked for {wait}s
        </p>
      )}
    </div>
  )
}
