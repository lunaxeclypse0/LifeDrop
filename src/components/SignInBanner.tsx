import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useApp } from '../lib/store'
import { cloudConfigured } from '../lib/supabase'

const DISMISSED_KEY = 'lifedrop.signInDismissed'

/**
 * Anyone who chose "without an account" has their drops on one device only,
 * and the way back into signing up was two taps deep inside Profile. This puts
 * it on Home, once, dismissibly.
 */
export function SignInBanner() {
  const navigate = useNavigate()
  const user = useApp((s) => s.user)
  const drops = useApp((s) => s.drops)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  if (!cloudConfigured() || user || dismissed) return null

  const count = drops.filter((d) => !d.sample).length

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        marginBottom: 16,
        borderColor: 'color-mix(in srgb, var(--accent) 35%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))',
      }}
    >
      <span
        className="tile sm"
        style={{ background: 'color-mix(in srgb, var(--accent) var(--tint), transparent)' }}
      >
        <Icon name="vault" size={17} color="var(--accent-ink)" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>Back up your drops</div>
        <div className="caption" style={{ marginTop: 1, lineHeight: 1.45 }}>
          {count > 0
            ? `Your ${count} ${count === 1 ? 'drop lives' : 'drops live'} on this device only. An account keeps them safe.`
            : 'An account syncs your drops to every device you use.'}
        </div>
      </div>
      <button
        onClick={() => navigate('/account?mode=signup')}
        style={{
          flex: 'none',
          padding: '10px 14px',
          borderRadius: 12,
          background: 'var(--brand-grad)',
          color: '#fff',
          fontSize: 13.5,
          fontWeight: 700,
        }}
      >
        Sign up
      </button>
      <button
        onClick={() => {
          setDismissed(true)
          try {
            localStorage.setItem(DISMISSED_KEY, '1')
          } catch {
            /* it comes back next session, which is fine */
          }
        }}
        aria-label="Not now"
        style={{ flex: 'none', padding: 4 }}
      >
        <Icon name="close" size={16} color="var(--muted)" width={2} />
      </button>
    </div>
  )
}
