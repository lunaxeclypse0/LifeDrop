import { useState } from 'react'
import { Icon } from './Icon'
import { DropMark } from './Brand'
import { BottomSheet } from './Sheet'
import { Button } from './UI'
import { useApp } from '../lib/store'
import { isIOS, useInstall } from '../lib/install'

function IOSSteps() {
  const steps: { icon: 'share' | 'plus' | 'check'; text: React.ReactNode }[] = [
    { icon: 'share', text: <>Tap the <strong>Share</strong> button in Safari's toolbar.</> },
    { icon: 'plus', text: <>Scroll down and choose <strong>Add to Home Screen</strong>.</> },
    { icon: 'check', text: <>Tap <strong>Add</strong>. LifeDrop appears with your other apps.</> },
  ]
  return (
    <ol style={{ listStyle: 'none', margin: '4px 0 18px', padding: 0 }}>
      {steps.map((s, i) => (
        <li key={i} style={{ display: 'flex', gap: 13, alignItems: 'center', padding: '11px 0' }}>
          <span
            className="tile sm"
            style={{ background: 'var(--primary-soft)', fontWeight: 800, position: 'relative' }}
          >
            <Icon name={s.icon} size={16} color="var(--primary-ink)" width={2} />
          </span>
          <span className="body2" style={{ flex: 1, color: 'var(--text)' }}>
            {s.text}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The dismissible prompt that sits at the top of Home. */
export function InstallBanner() {
  const { state, install, dismiss, dismissed } = useInstall()
  const showToast = useApp((s) => s.showToast)
  const [sheet, setSheet] = useState(false)

  if (dismissed || state === 'installed' || state === 'unavailable') return null

  const run = async () => {
    if (state === 'manual') {
      setSheet(true)
      return
    }
    const ok = await install()
    if (ok) showToast('LifeDrop is on your home screen')
  }

  return (
    <>
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          marginBottom: 16,
          borderColor: 'color-mix(in srgb, var(--primary) 32%, var(--border))',
          background: 'color-mix(in srgb, var(--primary) 4%, var(--surface))',
        }}
      >
        <DropMark size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>Install LifeDrop</div>
          <div className="caption" style={{ marginTop: 1, lineHeight: 1.45 }}>
            Add it to your home screen — opens full screen and works offline.
          </div>
        </div>
        <button
          onClick={run}
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
          Install
        </button>
        <button onClick={dismiss} aria-label="Not now" style={{ flex: 'none', padding: 4 }}>
          <Icon name="close" size={16} color="var(--muted)" width={2} />
        </button>
      </div>

      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Add LifeDrop to your home screen"
        subtitle="Safari does not offer a one-tap install, so it takes three steps."
      >
        <IOSSteps />
        <Button onClick={() => setSheet(false)}>Got it</Button>
      </BottomSheet>
    </>
  )
}

/** The same action as a settings row, for people who dismissed the banner. */
export function InstallRow() {
  const { state, install } = useInstall()
  const showToast = useApp((s) => s.showToast)
  const [sheet, setSheet] = useState(false)

  if (state === 'installed') {
    return (
      <div className="row">
        <div className="mid">
          <div className="t">Installed</div>
          <div className="d">LifeDrop is running from your home screen.</div>
        </div>
        <Icon name="check" size={18} color="var(--success)" width={2.2} />
      </div>
    )
  }

  if (state === 'unavailable') {
    return (
      <div className="row">
        <div className="mid">
          <div className="t">Install app</div>
          <div className="d">
            This browser cannot install LifeDrop. Open it in Chrome, Edge or Safari on your phone.
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        className="row"
        onClick={async () => {
          if (state === 'manual') {
            setSheet(true)
            return
          }
          const ok = await install()
          if (ok) showToast('LifeDrop is on your home screen')
        }}
      >
        <div className="mid">
          <div className="t">Install app</div>
          <div className="d">
            {isIOS()
              ? 'Add LifeDrop to your home screen from Safari'
              : 'Add LifeDrop to your home screen'}
          </div>
        </div>
        <Icon name="download" size={18} color="var(--primary-ink)" />
      </button>

      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Add LifeDrop to your home screen"
        subtitle="Safari does not offer a one-tap install, so it takes three steps."
      >
        <IOSSteps />
        <Button onClick={() => setSheet(false)}>Got it</Button>
      </BottomSheet>
    </>
  )
}
