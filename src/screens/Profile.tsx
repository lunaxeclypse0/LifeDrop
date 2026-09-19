import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, SectionHead, Tile, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { InstallRow } from '../components/InstallApp'
import { liveDrops, useApp } from '../lib/store'
import { cloudConfigured } from '../lib/supabase'
import { emailToUsername, isUsernameAccount } from '../lib/username'
import { pesoCompact } from '../lib/format'
import type { IconName } from '../lib/icons'

const LINKS: { label: string; to: string; icon: IconName }[] = [
  { label: 'Notifications', to: '/settings/notifications', icon: 'bell' },
  { label: 'Privacy & Security', to: '/settings/privacy', icon: 'shield' },
  { label: 'Appearance', to: '/settings/appearance', icon: 'moon' },
  { label: 'Subscriptions', to: '/subscriptions', icon: 'subscription' },
  { label: 'Spending insights', to: '/spending', icon: 'peso' },
  { label: 'Help & Support', to: '/settings/help', icon: 'help' },
]

export function Profile() {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const settings = useApp((s) => s.settings)
  const user = useApp((s) => s.user)
  const syncing = useApp((s) => s.syncing)
  const syncError = useApp((s) => s.syncError)
  const syncNow = useApp((s) => s.syncNow)
  const signOut = useApp((s) => s.signOut)

  const stats = useMemo(() => {
    const live = liveDrops(drops)
    const tracked = live.reduce((s, d) => s + (d.amount ?? 0), 0)
    const reminders = live.filter((d) => d.remindDaysBefore !== null).length
    return [
      { n: String(drops.length), l: 'Drops saved' },
      { n: String(reminders), l: 'Reminders set' },
      { n: pesoCompact(tracked), l: 'Tracked' },
    ]
  }, [drops])

  const named = settings.name.trim().length > 0
  const initials =
    settings.name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'LD'

  return (
    <div className="screen">
      <TopBar title="Profile" back />

      <div className="scrollhost no-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <span
            style={{
              flex: 'none',
              width: 62,
              height: 62,
              borderRadius: 999,
              background: 'var(--brand-grad)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'Manrope, sans-serif',
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: '-.5px',
            }}
          >
            {initials}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{ fontSize: 21 }}>
              {named ? settings.name : 'Your profile'}
            </div>
            <div className="body2" style={{ fontSize: 13.5 }}>
              {isUsernameAccount(settings.email)
                ? `@${emailToUsername(settings.email)}`
                : settings.email || (named ? 'No email set' : 'Tap Edit profile to add your name')}
            </div>
          </div>
        </div>

        <div className="grid3">
          {stats.map((s) => (
            <div key={s.l} className="card" style={{ textAlign: 'center', padding: '14px 8px' }}>
              <div className="num" style={{ fontSize: 20 }}>
                {s.n}
              </div>
              <div className="caption" style={{ marginTop: 2 }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>

        {cloudConfigured() && (
          <>
            <SectionHead label="Account" />
            <div className="rows">
              {user ? (
                <>
                  <div className="row">
                    <div className="mid">
                      <div className="t">Signed in</div>
                      <div className="d">
                        {isUsernameAccount(user.email) ? emailToUsername(user.email!) : user.email} ·{' '}
                        {syncing ? 'syncing…' : syncError ? `not synced: ${syncError}` : 'synced'}
                      </div>
                    </div>
                    <Icon
                      name={syncError ? 'alert' : 'check'}
                      size={18}
                      color={syncError ? 'var(--warning)' : 'var(--success)'}
                      width={2.2}
                    />
                  </div>
                  <button className="row" onClick={() => void syncNow()}>
                    <div className="mid">
                      <div className="t">Sync now</div>
                      <div className="d">Push anything waiting and pull what is new</div>
                    </div>
                    <Icon name="refresh" size={18} color="var(--primary-ink)" />
                  </button>
                </>
              ) : (
                <button className="row" onClick={() => navigate('/account')}>
                  <div className="mid">
                    <div className="t">Sign in or create an account</div>
                    <div className="d">
                      Right now your drops live only on this device. An account backs them up and
                      syncs them.
                    </div>
                  </div>
                  <Icon name="chev" size={17} color="var(--muted)" />
                </button>
              )}
            </div>
          </>
        )}

        <SectionHead label="App" />
        <div className="rows">
          <InstallRow />
        </div>

        <SectionHead label="Settings" />
        <div className="rows">
          {LINKS.map((l) => (
            <button key={l.to} className="row" onClick={() => navigate(l.to)}>
              <Tile icon={l.icon} size="sm" />
              <span className="mid">
                <span className="t">{l.label}</span>
              </span>
              <Icon name="chev" size={17} color="var(--muted)" />
            </button>
          ))}
        </div>

        <div className="divider" />

        <Button variant="secondary" icon="edit" onClick={() => navigate('/setup?edit=1')}>
          Edit profile
        </Button>
        {user && (
          <Button
            variant="destructive"
            icon="logout"
            onClick={async () => {
              await signOut()
              navigate('/home', { replace: true })
            }}
          >
            Sign out
          </Button>
        )}

        <p className="caption" style={{ textAlign: 'center', marginTop: 18 }}>
          LifeDrop 1.0.0 —{' '}
          {user ? 'your drops sync to your account.' : 'your drops stay on this device.'}
        </p>
      </div>
    </div>
  )
}
