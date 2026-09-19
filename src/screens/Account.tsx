import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field, TopBar } from '../components/UI'
import { DropMark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { useApp } from '../lib/store'
import { cloudConfigured } from '../lib/supabase'
import { USERNAME_MAX, validateUsername } from '../lib/username'

/**
 * A real account this time: the password is checked by Supabase, and every
 * drop is stored against the signed-in user id with row-level security. See
 * supabase/schema.sql — that file, not this screen, is what keeps one person's
 * vault away from everyone else's.
 */

const MIN_PASSWORD = 8

export function Account() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'signup' ? 'signup' : 'signin'

  const signIn = useApp((s) => s.signIn)
  const signUp = useApp((s) => s.signUp)
  const drops = useApp((s) => s.drops)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!cloudConfigured()) {
    return (
      <div className="screen">
        <TopBar title="Accounts" back />
        <div className="scrollhost no-nav" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 300 }}>
            <Icon name="alert" size={32} color="var(--warning)" />
            <h2 className="display" style={{ fontSize: 20, margin: '16px 0 8px' }}>
              Accounts are not set up
            </h2>
            <p className="body2" style={{ margin: '0 0 20px' }}>
              This build has no Supabase project connected, so there is nothing to sign in to.
              LifeDrop still works — everything stays on this device.
            </p>
            <Button variant="secondary" onClick={() => navigate('/home')}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const submit = async () => {
    const found: typeof errors = {}
    const badName = validateUsername(username)
    if (badName) found.username = badName
    if (password.length < MIN_PASSWORD) {
      found.password = `At least ${MIN_PASSWORD} characters.`
    }
    setErrors(found)
    setFailure(null)
    setNotice(null)
    if (Object.keys(found).length) return

    setBusy(true)
    const problem =
      mode === 'signup' ? await signUp(username, password) : await signIn(username, password)
    setBusy(false)

    if (!problem) {
      navigate(mode === 'signup' ? '/permissions' : '/home', { replace: true })
      return
    }
    // Supabase returns "check your email" as a message, not an error.
    if (/confirm|check your email/i.test(problem)) setNotice(problem)
    else setFailure(problem)
  }

  const swap = () => {
    setParams(mode === 'signup' ? {} : { mode: 'signup' }, { replace: true })
    setErrors({})
    setFailure(null)
    setNotice(null)
  }

  const localCount = drops.filter((d) => !d.sample).length

  return (
    <div className="screen">
      <TopBar back onBack={() => navigate('/home')} />
      <div className="scrollhost no-nav">
        <DropMark size={50} />
        <h2 className="display" style={{ fontSize: 26, margin: '16px 0 6px' }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="body2" style={{ margin: '0 0 22px' }}>
          {mode === 'signup'
            ? 'Pick a username. Your drops sync across your devices and stay yours alone.'
            : 'Sign in to reach your vault from any device.'}
        </p>

        {mode === 'signup' && localCount > 0 && (
          <div className="card" style={{ display: 'flex', gap: 11, marginBottom: 16 }}>
            <Icon name="check" size={18} color="var(--success)" width={2.2} />
            <div className="body2" style={{ fontSize: 13.5 }}>
              The {localCount} {localCount === 1 ? 'drop' : 'drops'} already on this device will move
              into your new account.
            </div>
          </div>
        )}

        <Field label="Username" error={errors.username}>
          <Icon name="profile" size={18} color="var(--muted)" />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="lance"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </Field>

        <Field label="Password" error={errors.password}>
          <Icon name="lock" size={18} color="var(--muted)" />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
            type={show ? 'text' : 'password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          <button onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
            <Icon name="eye" size={18} color="var(--muted)" />
          </button>
        </Field>

        {failure && (
          <div
            className="card"
            style={{
              display: 'flex',
              gap: 11,
              marginBottom: 14,
              borderColor: 'color-mix(in srgb, var(--danger) 45%, var(--border))',
            }}
          >
            <Icon name="alert" size={18} color="var(--danger)" />
            <div className="body2" style={{ fontSize: 13.5, color: 'var(--text)' }}>
              {failure}
            </div>
          </div>
        )}

        {notice && (
          <div
            className="card"
            style={{
              display: 'flex',
              gap: 11,
              marginBottom: 14,
              borderColor: 'color-mix(in srgb, var(--success) 45%, var(--border))',
            }}
          >
            <Icon name="inbox" size={18} color="var(--success)" />
            <div className="body2" style={{ fontSize: 13.5, color: 'var(--text)' }}>
              {notice}
            </div>
          </div>
        )}

        <Button onClick={submit} disabled={busy}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
        <Button variant="ghost" onClick={swap}>
          {mode === 'signup' ? 'I already have an account' : 'Create an account'}
        </Button>

        {mode === 'signup' && (
          <div
            className="card"
            style={{
              display: 'flex',
              gap: 11,
              marginTop: 14,
              borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
            }}
          >
            <Icon name="alert" size={18} color="var(--warning)" />
            <div className="body2" style={{ fontSize: 13 }}>
              There is no email on the account, so a forgotten password cannot be reset. Write it
              down somewhere safe.
            </div>
          </div>
        )}

        <p className="caption" style={{ textAlign: 'center', marginTop: 18, lineHeight: 1.55 }}>
          Your drops are stored in your account and readable only by you. Review before saving.
          Delete your data anytime.
        </p>
      </div>
    </div>
  )
}
