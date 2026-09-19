import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field, TopBar } from '../components/UI'
import { DropMark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { useApp } from '../lib/store'

/**
 * There is no account and no server, so there is no sign-in. This sets up a
 * profile on this device. Asking for a password would be theatre — nothing
 * could check it — and the brand guide rules out claims the app cannot back.
 * What actually protects the vault is the PIN in Settings > Privacy.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function Setup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'

  const settings = useApp((s) => s.settings)
  const patchSettings = useApp((s) => s.patchSettings)
  const showToast = useApp((s) => s.showToast)

  const [name, setName] = useState(editing ? settings.name : '')
  const [email, setEmail] = useState(editing ? settings.email : '')
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})

  const submit = async () => {
    const next: typeof errors = {}
    if (name.trim().length < 2) next.name = 'Tell us what to call you.'
    if (email.trim() && !EMAIL_RE.test(email.trim())) next.email = 'That email does not look right.'
    setErrors(next)
    if (Object.keys(next).length) return

    await patchSettings({ name: name.trim(), email: email.trim(), onboarded: true })

    if (editing) {
      showToast('Profile updated')
      navigate('/profile', { replace: true })
    } else {
      navigate('/permissions', { replace: true })
    }
  }

  return (
    <div className="screen">
      <TopBar
        back={editing}
        onBack={editing ? () => navigate('/profile') : undefined}
        title={editing ? 'Edit profile' : undefined}
      />

      <div className="scrollhost no-nav">
        {!editing && (
          <>
            <DropMark size={52} />
            <h2 className="display" style={{ fontSize: 27, margin: '16px 0 6px' }}>
              Set up LifeDrop
            </h2>
            <p className="body2" style={{ margin: '0 0 22px' }}>
              This names the app for you. To back your drops up and reach them from another
              device, add an account from Profile.
            </p>
          </>
        )}

        <Field label="Name" error={errors.name}>
          <Icon name="profile" size={18} color="var(--muted)" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
            autoComplete="name"
          />
        </Field>

        <Field label="Email (optional)" error={errors.email}>
          <Icon name="inbox" size={18} color="var(--muted)" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            inputMode="email"
          />
        </Field>
        <p className="caption" style={{ margin: '-4px 0 22px', lineHeight: 1.5 }}>
          Only used to label your data export. It is never sent anywhere.
        </p>

        <Button onClick={submit}>{editing ? 'Save changes' : 'Continue'}</Button>

        {!editing && (
          <p className="caption" style={{ textAlign: 'center', marginTop: 20, lineHeight: 1.55 }}>
            Your drops stay private. Review before saving. Delete your data anytime.
          </p>
        )}
      </div>
    </div>
  )
}
