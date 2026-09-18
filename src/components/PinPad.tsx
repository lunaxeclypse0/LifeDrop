import { useEffect } from 'react'
import { Icon } from './Icon'

export const PIN_LENGTH = 6
export const PIN_MIN = 4

export function PinDots({
  length,
  filled,
  error,
}: {
  length: number
  filled: number
  error?: boolean
}) {
  return (
    <div
      className={error ? 'pin-dots shake' : 'pin-dots'}
      key={error ? 'err' : 'ok'}
      aria-hidden="true"
    >
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          className="pin-dot"
          style={{
            background: i < filled ? (error ? 'var(--danger)' : 'var(--primary)') : 'transparent',
            borderColor: i < filled ? (error ? 'var(--danger)' : 'var(--primary)') : 'var(--border)',
          }}
        />
      ))}
    </div>
  )
}

export function PinPad({
  value,
  onChange,
  onSubmit,
  disabled,
  onBiometric,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  disabled?: boolean
  /** Shown in the bottom-left slot when the device has an enrolled passkey. */
  onBiometric?: () => void
}) {
  const push = (d: string) => {
    if (disabled || value.length >= PIN_LENGTH) return
    navigator.vibrate?.(8)
    onChange(value + d)
  }

  const back = () => {
    if (disabled) return
    onChange(value.slice(0, -1))
  }

  // A hardware keyboard should work too — this runs on desktop as well.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return
      if (/^\d$/.test(e.key)) push(e.key)
      else if (e.key === 'Backspace') back()
      else if (e.key === 'Enter') onSubmit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="pinpad">
      {keys.map((k) => (
        <button key={k} className="pinkey" onClick={() => push(k)} disabled={disabled}>
          {k}
        </button>
      ))}

      {onBiometric ? (
        <button className="pinkey ghost" onClick={onBiometric} disabled={disabled} aria-label="Unlock with biometrics">
          <Icon name="lock" size={22} width={1.8} />
        </button>
      ) : (
        <span />
      )}

      <button className="pinkey" onClick={() => push('0')} disabled={disabled}>
        0
      </button>

      <button
        className="pinkey ghost"
        onClick={back}
        disabled={disabled || value.length === 0}
        aria-label="Delete"
      >
        <Icon name="back" size={22} width={1.8} />
      </button>
    </div>
  )
}
