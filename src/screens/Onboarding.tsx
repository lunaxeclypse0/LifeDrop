import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/UI'
import { DropMark } from '../components/Brand'
import { Icon } from '../components/Icon'

const STEPS = [
  {
    title: 'Drop anything important.',
    body: 'Screenshots, bills, receipts, bookings and more.',
  },
  {
    title: 'LifeDrop organizes it.',
    body: 'Important dates, amounts and reminders are found automatically.',
  },
  {
    title: 'Remember less. Live more.',
    body: 'LifeDrop keeps important things from slipping through the cracks.',
  },
]

function Art({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div style={{ position: 'relative', height: 200, display: 'grid', placeItems: 'center' }}>
        <div className="anim-float">
          <DropMark size={96} />
        </div>
        {[
          { left: '8%', top: 14, w: 74, r: '-9deg' },
          { right: '6%', top: 34, w: 62, r: '11deg' },
          { left: '14%', bottom: 16, w: 58, r: '6deg' },
        ].map((p, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              ...p,
              height: 12,
              borderRadius: 999,
              background: 'var(--border)',
              transform: `rotate(${p.r})`,
              width: p.w,
            }}
          />
        ))}
      </div>
    )
  }
  if (step === 1) {
    return (
      <div style={{ height: 200, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 218 }}>
          {['bill', 'receipt', 'booking'].map((c, i) => (
            <div
              key={c}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                marginBottom: 8,
                animation: `cardIn 240ms var(--e-out) ${i * 120}ms both`,
              }}
            >
              <span
                className="tile sm"
                style={{ background: `color-mix(in srgb, var(--cat-${c}) var(--tint), transparent)` }}
              >
                <Icon name={c as 'bill'} size={16} color={`var(--cat-${c})`} />
              </span>
              <span style={{ flex: 1 }}>
                <span className="skel" style={{ display: 'block', height: 9, width: '70%' }} />
                <span className="skel" style={{ display: 'block', height: 7, width: '44%', marginTop: 6 }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div style={{ height: 200, display: 'grid', placeItems: 'center' }}>
      <div
        className="gradcard"
        style={{ width: 218, padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <Icon name="bell" size={30} color="#fff" width={1.9} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Internet bill</div>
          <div style={{ fontSize: 11.5, opacity: 0.86, marginTop: 2 }}>Due in 2 days</div>
        </div>
      </div>
    </div>
  )
}

export function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1

  return (
    <div className="screen">
      <div
        style={{
          padding: 'calc(var(--safe-top) + 14px) var(--gutter) 0',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          className="btn ghost"
          style={{ width: 'auto', padding: '10px 6px' }}
          onClick={() => navigate('/setup')}
        >
          Skip
        </button>
      </div>

      <div className="scrollhost no-nav" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div key={step} style={{ width: '100%', animation: 'cardIn 300ms var(--e-out) both' }}>
            <Art step={step} />
            <h2
              className="display"
              style={{ fontSize: 29, lineHeight: 1.16, margin: '28px 0 0', textAlign: 'center' }}
            >
              {STEPS[step].title}
            </h2>
            <p
              className="body2"
              style={{ margin: '10px auto 0', maxWidth: 280, textAlign: 'center', fontSize: 14.5 }}
            >
              {STEPS[step].body}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, margin: '28px 0 20px' }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                height: 7,
                width: i === step ? 22 : 7,
                borderRadius: 999,
                background: i === step ? 'var(--primary)' : 'var(--border)',
                transition: 'width var(--t-fast) var(--e-spring), background var(--t-fast) ease',
              }}
            />
          ))}
        </div>

        <Button onClick={() => (last ? navigate('/setup') : setStep(step + 1))}>
          {last ? 'Get Started' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
