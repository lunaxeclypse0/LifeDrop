import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Sheet'
import { Button, SectionHead, Toggle, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { useApp } from '../lib/store'
import { exportAll } from '../lib/db'
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
} from '../lib/reminders'
import { enrolBiometric, platformAuthenticatorAvailable } from '../lib/lock'
import type { AppSettings } from '../lib/types'

const PREFS: { key: keyof AppSettings['prefs']; title: string; body: string }[] = [
  { key: 'bills', title: 'Bills & due dates', body: 'Get reminded before money is due' },
  { key: 'events', title: 'Events & appointments', body: 'Calendar items from your drops' },
  { key: 'renew', title: 'Subscription renewals', body: 'Before a recurring charge hits' },
  { key: 'review', title: 'Drops waiting for review', body: 'A nudge when items need a look' },
  { key: 'quiet', title: 'Quiet hours', body: 'Silence alerts 10 PM – 7 AM' },
  { key: 'hideOnLock', title: 'Hide details on lock screen', body: 'Show only "LifeDrop reminder"' },
]

export function NotificationPrefs() {
  const settings = useApp((s) => s.settings)
  const setPref = useApp((s) => s.setPref)
  const showToast = useApp((s) => s.showToast)
  const sweep = useApp((s) => s.sweepReminders)
  const perm = notificationPermission()

  return (
    <div className="screen">
      <TopBar title="Notifications" back />
      <div className="scrollhost no-nav">
        {notificationsSupported() ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Icon
                name={perm === 'granted' ? 'bell' : 'bellOff'}
                size={19}
                color={perm === 'granted' ? 'var(--success)' : 'var(--muted)'}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {perm === 'granted' ? 'Reminders are on' : 'Reminders are off'}
                </div>
                <div className="caption" style={{ marginTop: 2, lineHeight: 1.5 }}>
                  {perm === 'granted'
                    ? 'LifeDrop checks your drops whenever you open it.'
                    : perm === 'denied'
                      ? 'Your browser is blocking notifications. Turn them on in site settings.'
                      : 'Allow notifications so a due date never arrives without warning.'}
                </div>
              </div>
            </div>
            {perm === 'default' && (
              <div style={{ marginTop: 12 }}>
                <Button
                  small
                  onClick={async () => {
                    const next = await requestNotificationPermission()
                    if (next === 'granted') {
                      await sweep()
                      showToast('Reminders are on')
                    } else showToast('Reminders stay off')
                  }}
                >
                  Allow notifications
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="body2" style={{ fontSize: 13.5 }}>
              This browser does not support notifications. LifeDrop still shows what is due on Home.
            </div>
          </div>
        )}

        <SectionHead label="What to tell me about" first />
        <div className="rows">
          {PREFS.map((p) => (
            <div className="row" key={p.key}>
              <div className="mid">
                <div className="t">{p.title}</div>
                <div className="d">{p.body}</div>
              </div>
              <Toggle
                on={settings.prefs[p.key]}
                onChange={(v) => void setPref(p.key, v)}
                label={p.title}
              />
            </div>
          ))}
        </div>

        <p className="caption" style={{ marginTop: 16, lineHeight: 1.55 }}>
          LifeDrop is a web app, so reminders are checked when it is open or when you come back to
          it, not while your phone is asleep.
        </p>
      </div>
    </div>
  )
}

export function Privacy() {
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)
  const user = useApp((s) => s.user)
  const resetEverything = useApp((s) => s.resetEverything)
  const disableLock = useApp((s) => s.disableLock)
  const setBiometricId = useApp((s) => s.setBiometricId)
  const showToast = useApp((s) => s.showToast)
  const [confirm, setConfirm] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [canBiometric, setCanBiometric] = useState(false)

  const locked = settings.lock.enabled

  useEffect(() => {
    void platformAuthenticatorAvailable().then(setCanBiometric)
  }, [])

  const exportData = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lifedrop-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Export downloaded')
  }

  return (
    <div className="screen">
      <TopBar title="Privacy & Security" back />
      <div className="scrollhost no-nav">
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <Icon name="shield" size={19} color="var(--primary-ink)" />
            <div className="body2" style={{ fontSize: 13.5 }}>
              {user
                ? 'Your drops are stored in your account and readable only by you. Review before saving. Delete your data anytime.'
                : 'Your drops stay on this device. Review before saving. Delete your data anytime.'}
            </div>
          </div>
        </div>

        <SectionHead label="Lock" first />
        <div className="rows">
          <div className="row">
            <div className="mid">
              <div className="t">PIN lock</div>
              <div className="d">
                {locked
                  ? 'LifeDrop asks for your PIN each time you open it'
                  : 'Anyone holding this device can open your vault'}
              </div>
            </div>
            <Toggle
              on={locked}
              onChange={(v) => (v ? navigate('/settings/pin') : setConfirmOff(true))}
              label="PIN lock"
            />
          </div>

          {locked && (
            <button className="row" onClick={() => navigate('/settings/pin')}>
              <div className="mid">
                <div className="t">Change PIN</div>
              </div>
              <Icon name="chev" size={17} color="var(--muted)" />
            </button>
          )}

          {locked && canBiometric && (
            <div className="row">
              <div className="mid">
                <div className="t">Unlock with this device</div>
                <div className="d">Face ID, fingerprint or Windows Hello, with the PIN as fallback</div>
              </div>
              <Toggle
                on={!!settings.lock.biometricId}
                onChange={async (v) => {
                  if (!v) {
                    await setBiometricId(null)
                    showToast('Biometric unlock off')
                    return
                  }
                  const id = await enrolBiometric(settings.name)
                  if (id) {
                    await setBiometricId(id)
                    showToast('Biometric unlock is on')
                  } else {
                    showToast('This device would not set that up.')
                  }
                }}
                label="Unlock with this device"
              />
            </div>
          )}
        </div>

        {locked && (
          <p className="caption" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Your PIN is never stored — only a salted hash of it. It stops someone who picks up your
            phone. It does not encrypt the stored data, so it is not protection against someone who
            controls this computer.
          </p>
        )}

        <SectionHead label="Your data" />
        <div className="rows">
          <button className="row" onClick={exportData}>
            <div className="mid">
              <div className="t">Data export</div>
              <div className="d">Download every drop as a JSON file</div>
            </div>
            <Icon name="download" size={18} color="var(--muted)" />
          </button>
          <div className="row">
            <div className="mid">
              <div className="t">AI processing</div>
              <div className="d">On · you review every reading before it is saved</div>
            </div>
          </div>
          <button className="row" onClick={() => setConfirm(true)}>
            <div className="mid">
              <div className="t" style={{ color: 'var(--danger)' }}>
                Delete everything
              </div>
              <div className="d">Removes every drop, image and preference</div>
            </div>
            <Icon name="trash" size={18} color="var(--danger)" />
          </button>
        </div>

        <p className="caption" style={{ marginTop: 16, lineHeight: 1.55 }}>
          {user
            ? 'Signed in, your drops live in your account as well as on this device, so clearing site data no longer loses them. Deleting removes both.'
            : "LifeDrop stores your drops in this browser's own storage. Clearing site data removes them too, so export anything you want to keep."}
        </p>
      </div>

      <Modal open={confirmOff} onClose={() => setConfirmOff(false)} title="Turn off the PIN?">
        <p className="body2" style={{ margin: '0 0 18px' }}>
          LifeDrop will open straight into your vault — bills, receipts, passport and all — for
          anyone holding this device.
        </p>
        <Button
          variant="destructive"
          icon="lock"
          onClick={async () => {
            await disableLock()
            setConfirmOff(false)
            showToast('PIN lock off')
          }}
        >
          Turn it off
        </Button>
        <Button variant="ghost" onClick={() => setConfirmOff(false)}>
          Keep it on
        </Button>
      </Modal>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete everything?">
        <p className="body2" style={{ margin: '0 0 18px' }}>
          Every drop, every original image and all your preferences are removed from this device.
          This cannot be undone.
        </p>
        <Button
          variant="destructive"
          icon="trash"
          onClick={async () => {
            await resetEverything()
            navigator.vibrate?.([20, 50, 20])
            showToast('Everything deleted')
            navigate('/onboarding', { replace: true })
          }}
        >
          Delete everything
        </Button>
        <Button variant="ghost" onClick={() => setConfirm(false)}>
          Keep my data
        </Button>
      </Modal>
    </div>
  )
}

export function Appearance() {
  const settings = useApp((s) => s.settings)
  const patchSettings = useApp((s) => s.patchSettings)

  const options: { key: AppSettings['theme']; label: string; preview: string }[] = [
    { key: 'light', label: 'Light', preview: '#F8FAFC' },
    { key: 'dark', label: 'Dark', preview: '#0B1220' },
    { key: 'system', label: 'System', preview: 'linear-gradient(110deg,#F8FAFC 50%,#0B1220 50%)' },
  ]

  return (
    <div className="screen">
      <TopBar title="Appearance" back />
      <div className="scrollhost no-nav">
        <p className="body2" style={{ margin: '0 0 18px' }}>
          Dark mode is a near-black navy, not an inversion — the same palette, lifted. There is also
          a one-tap switch in the top bar on Home.
        </p>

        <div className="grid3">
          {options.map((o) => {
            const on = settings.theme === o.key
            return (
              <button
                key={o.key}
                onClick={() => void patchSettings({ theme: o.key })}
                aria-pressed={on}
                style={{
                  borderRadius: 16,
                  padding: 10,
                  background: on ? 'var(--primary-soft)' : 'var(--surface)',
                  border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                  transition: 'border-color var(--t-fast) ease, background var(--t-fast) ease',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: 74,
                    borderRadius: 10,
                    background: o.preview,
                    border: '1px solid var(--border)',
                    padding: 9,
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: 7,
                      width: '76%',
                      borderRadius: 999,
                      background: o.key === 'dark' ? '#475569' : '#CBD5E1',
                      marginBottom: 6,
                    }}
                  />
                  <span
                    style={{
                      display: 'block',
                      height: 7,
                      width: '52%',
                      borderRadius: 999,
                      background: o.key === 'dark' ? '#243049' : '#E2E8F0',
                    }}
                  />
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    marginTop: 9,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {on && <Icon name="check" size={13} color="var(--primary-ink)" width={2.6} />}
                  {o.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const TOPICS: { q: string; a: string }[] = [
  {
    q: 'How LifeDrop reads your drops',
    a: 'When you drop a screenshot, photo or PDF, LifeDrop pulls out the title, merchant, amount, dates and category, then shows you everything before it saves. Nothing is filed without your say-so.',
  },
  {
    q: 'Fix a wrong amount or date',
    a: 'Open the item and tap the pencil. Every field is editable, and your correction replaces the reading straight away.',
  },
  {
    q: 'Set up reminders that work for you',
    a: 'Each drop carries its own "remind me" setting — from the day itself up to 90 days before. Settings > Notifications controls which kinds of drops are allowed to reach you at all.',
  },
  {
    q: 'Why a reminder did not arrive',
    a: 'LifeDrop runs in your browser, so it can only check reminders while it is open or when you come back to it. Keep it installed on your home screen and open it daily.',
  },
  {
    q: 'Export or delete your data',
    a: 'Settings > Privacy & Security. Export downloads every drop as a JSON file. Delete removes everything on this device, permanently.',
  },
]

export function Help() {
  const [open, setOpen] = useState<number | null>(0)
  const showToast = useApp((s) => s.showToast)
  const hasSamples = useApp((s) => s.drops.some((d) => d.sample))
  const loadSamples = useApp((s) => s.loadSamples)
  const clearSamples = useApp((s) => s.clearSamples)

  return (
    <div className="screen">
      <TopBar title="Help & Support" back />
      <div className="scrollhost no-nav">
        <div className="rows">
          {TOPICS.map((t, i) => (
            <div className="row" key={t.q} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}
              >
                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{t.q}</span>
                <Icon
                  name="chevdown"
                  size={17}
                  color="var(--muted)"
                  className={open === i ? 'open' : undefined}
                />
              </button>
              {open === i && (
                <p
                  className="body2"
                  style={{ margin: '10px 0 2px', fontSize: 13.5, animation: 'cardIn 200ms var(--e-out) both' }}
                >
                  {t.a}
                </p>
              )}
            </div>
          ))}
        </div>

        <SectionHead label="Sample data" />
        <div className="rows">
          <button
            className="row"
            onClick={async () => {
              if (hasSamples) {
                await clearSamples()
                showToast('Sample data removed')
              } else {
                await loadSamples()
                showToast('Sample vault loaded')
              }
            }}
          >
            <div className="mid">
              <div className="t">{hasSamples ? 'Remove sample data' : 'Load sample data'}</div>
              <div className="d">
                {hasSamples
                  ? 'Deletes only the demo drops. Anything you dropped yourself stays.'
                  : 'Fills the app with example bills and receipts so you can look around.'}
              </div>
            </div>
            <Icon name={hasSamples ? 'trash' : 'plus'} size={18} color="var(--muted)" />
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <Button
            variant="secondary"
            icon="link"
            onClick={() => {
              void navigator.clipboard
                ?.writeText('support@lifedrop.app')
                .then(() => showToast('support@lifedrop.app copied'))
                .catch(() => showToast('support@lifedrop.app'))
            }}
          >
            Contact support
          </Button>
        </div>

        <p className="caption" style={{ textAlign: 'center', marginTop: 18 }}>
          LifeDrop 1.0.0
        </p>
      </div>
    </div>
  )
}
