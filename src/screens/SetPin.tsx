import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { PinDots, PinPad, PIN_LENGTH, PIN_MIN } from '../components/PinPad'
import { useApp } from '../lib/store'
import { enrolBiometric, platformAuthenticatorAvailable, verifyPin } from '../lib/lock'

type Stage = 'current' | 'choose' | 'confirm' | 'biometric'

export function SetPin() {
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)
  const setPin = useApp((s) => s.setPin)
  const setBiometricId = useApp((s) => s.setBiometricId)
  const showToast = useApp((s) => s.showToast)

  const changing = settings.lock.enabled
  const [stage, setStage] = useState<Stage>(changing ? 'current' : 'choose')
  const [entry, setEntry] = useState('')
  const [first, setFirst] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [canBiometric, setCanBiometric] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void platformAuthenticatorAvailable().then(setCanBiometric)
  }, [])

  const COPY: Record<Stage, { title: string; body: string }> = {
    current: { title: 'Enter your current PIN', body: 'Confirm it is you before changing the lock.' },
    choose: { title: 'Choose a PIN', body: `${PIN_MIN} to ${PIN_LENGTH} digits. You will need it every time you open LifeDrop.` },
    confirm: { title: 'Enter it again', body: 'Just to be sure you will remember it.' },
    biometric: { title: 'Faster unlocking', body: 'Use this device to unlock without typing the PIN.' },
  }

  const advance = async (value: string) => {
    setError(null)

    if (stage === 'current') {
      setBusy(true)
      const ok = await verifyPin(value, settings.lock)
      setBusy(false)
      if (!ok) {
        setEntry('')
        setError('That is not your current PIN.')
        navigator.vibrate?.([20, 60, 20])
        return
      }
      setEntry('')
      setStage('choose')
      return
    }

    if (stage === 'choose') {
      setFirst(value)
      setEntry('')
      setStage('confirm')
      return
    }

    if (stage === 'confirm') {
      if (value !== first) {
        setEntry('')
        setFirst('')
        setStage('choose')
        setError('Those did not match. Start again.')
        navigator.vibrate?.([20, 60, 20])
        return
      }
      setBusy(true)
      await setPin(value)
      setBusy(false)
      navigator.vibrate?.(12)
      if (canBiometric && !settings.lock.biometricId) {
        setEntry('')
        setStage('biometric')
      } else {
        showToast('PIN lock is on')
        navigate('/settings/privacy', { replace: true })
      }
    }
  }

  const change = (next: string) => {
    setError(null)
    setEntry(next)
    if (next.length === PIN_LENGTH) void advance(next)
  }

  const enrol = async () => {
    setBusy(true)
    const id = await enrolBiometric(settings.name)
    setBusy(false)
    if (id) {
      await setBiometricId(id)
      showToast('Biometric unlock is on')
    } else {
      showToast('This device would not set that up. Your PIN still works.')
    }
    navigate('/settings/privacy', { replace: true })
  }

  if (stage === 'biometric') {
    return (
      <div className="screen">
        <TopBar />
        <div className="scrollhost no-nav" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 300 }}>
            <span
              className="tile lg"
              style={{ margin: '0 auto', background: 'var(--primary-soft)' }}
            >
              <Icon name="lock" size={26} color="var(--primary-ink)" />
            </span>
            <h2 className="display" style={{ fontSize: 22, margin: '18px 0 8px' }}>
              {COPY.biometric.title}
            </h2>
            <p className="body2" style={{ margin: '0 0 24px' }}>
              Face ID, Touch ID, Windows Hello or your fingerprint — whichever this device offers.
              Your PIN keeps working as a fallback.
            </p>
            <Button icon="lock" onClick={enrol} disabled={busy}>
              {busy ? 'Setting up…' : 'Turn it on'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/settings/privacy', { replace: true })}>
              PIN only, thanks
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen lockscreen">
      {/* Outside lock-top: that block centres its children, which would float
          the back button into the middle of the screen. */}
      <TopBar back onBack={() => navigate(-1)} />
      <div className="lock-top">
        <h1 className="display" style={{ fontSize: 21, margin: '10px 0 5px' }}>
          {COPY[stage].title}
        </h1>
        <p className="body2" style={{ margin: 0, fontSize: 13.5, minHeight: 38, maxWidth: 280 }}>
          {error ?? COPY[stage].body}
        </p>

        <div style={{ marginTop: 18 }}>
          <PinDots length={PIN_LENGTH} filled={entry.length} error={!!error} />
        </div>
      </div>

      <PinPad
        value={entry}
        onChange={change}
        onSubmit={() => entry.length >= PIN_MIN && void advance(entry)}
        disabled={busy}
      />

      {entry.length >= PIN_MIN && entry.length < PIN_LENGTH && (
        <div style={{ padding: '10px var(--gutter) 0' }}>
          <Button small variant="secondary" onClick={() => void advance(entry)}>
            Use these {entry.length} digits
          </Button>
        </div>
      )}
    </div>
  )
}
