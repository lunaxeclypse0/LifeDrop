import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Tile, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { useApp } from '../lib/store'
import { notificationsSupported, requestNotificationPermission } from '../lib/reminders'

type Grant = 'idle' | 'granted' | 'denied'

export function Permissions() {
  const navigate = useNavigate()
  const showToast = useApp((s) => s.showToast)
  const [camera, setCamera] = useState<Grant>('idle')
  const [notify, setNotify] = useState<Grant>(
    notificationsSupported() && Notification.permission === 'granted' ? 'granted' : 'idle',
  )
  const [busy, setBusy] = useState(false)

  const askAll = async () => {
    setBusy(true)

    // The browser only surfaces these prompts from a user gesture, so both
    // are requested here rather than lazily at first use.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      stream.getTracks().forEach((t) => t.stop())
      setCamera('granted')
    } catch {
      setCamera('denied')
    }

    const perm = await requestNotificationPermission()
    setNotify(perm === 'granted' ? 'granted' : 'denied')

    setBusy(false)
    if (perm !== 'granted') {
      showToast('Reminders are off. You can turn them on in Settings.')
    }
    navigate('/home', { replace: true })
  }

  const rows: { title: string; body: string; icon: 'image' | 'camera' | 'bell'; state: Grant }[] = [
    {
      title: 'Photos',
      body: 'So you can drop screenshots and receipts straight from your library.',
      icon: 'image',
      state: 'idle',
    },
    {
      title: 'Camera',
      body: 'To scan paper bills, letters and warranty cards.',
      icon: 'camera',
      state: camera,
    },
    {
      title: 'Notifications',
      body: 'So a due date never arrives without warning.',
      icon: 'bell',
      state: notify,
    },
  ]

  return (
    <div className="screen">
      <TopBar back onBack={() => navigate('/setup')} />
      <div className="scrollhost no-nav">
        <h2 className="display" style={{ fontSize: 27, margin: '6px 0 6px' }}>
          Three quick permissions
        </h2>
        <p className="body2" style={{ margin: '0 0 24px' }}>
          LifeDrop only asks for what it needs to do its job.
        </p>

        <div className="rows" style={{ marginBottom: 20 }}>
          {rows.map((r) => (
            <div className="row" key={r.title} style={{ alignItems: 'flex-start' }}>
              <Tile icon={r.icon} />
              <div className="mid">
                <div className="t">{r.title}</div>
                <div className="d">{r.body}</div>
              </div>
              {r.state === 'granted' && <Icon name="check" size={18} color="var(--success)" width={2.2} />}
              {r.state === 'denied' && <Icon name="close" size={18} color="var(--muted)" width={2.2} />}
            </div>
          ))}
        </div>

        <Button onClick={askAll} disabled={busy}>
          {busy ? 'Asking…' : 'Allow and continue'}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/home', { replace: true })}>
          Not now
        </Button>

        <p className="caption" style={{ textAlign: 'center', marginTop: 18, lineHeight: 1.5 }}>
          You can change any of these later in Settings.
        </p>
      </div>
    </div>
  )
}
