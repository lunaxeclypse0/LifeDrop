import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DropMark, Ripples } from '../components/Brand'
import { useApp } from '../lib/store'

export function Splash() {
  const navigate = useNavigate()
  const ready = useApp((s) => s.ready)
  const settings = useApp((s) => s.settings)

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      navigate(settings.onboarded ? '/home' : '/onboarding', { replace: true })
    }, 1500)
    return () => clearTimeout(t)
  }, [ready, settings.onboarded, navigate])

  return (
    <div
      className="screen"
      style={{ alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}
    >
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
        <Ripples size={190} />
        <div className="anim-fall">
          <DropMark size={104} />
        </div>
      </div>
      <div
        style={{
          marginTop: 26,
          textAlign: 'center',
          animation: 'cardIn 320ms var(--e-out) 620ms both',
        }}
      >
        <div className="display" style={{ fontSize: 32 }}>
          LifeDrop
        </div>
        <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>
          Drop it. LifeDrop remembers.
        </div>
      </div>
    </div>
  )
}
