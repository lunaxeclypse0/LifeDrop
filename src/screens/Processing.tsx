import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Illustration } from '../components/Illustration'
import { Button, Progress, TopBar } from '../components/UI'
import { Ripples } from '../components/Brand'
import { useApp } from '../lib/store'
import {
  ExtractorNotConfiguredError,
  getExtractor,
  RateLimitedError,
  UnreadableDropError,
} from '../lib/extract'
import { peso, shortDate } from '../lib/format'
import { CATEGORIES } from '../lib/types'
import type { Extraction } from '../lib/types'

const CAPTIONS = [
  'Reading your drop…',
  'Finding important details…',
  'Checking dates and amounts…',
  'Organizing everything…',
  'Ready.',
]

type Phase = 'working' | 'unreadable' | 'unconfigured' | 'ratelimited' | 'failed'

export function Processing() {
  const navigate = useNavigate()
  const pending = useApp((s) => s.pending)
  const setExtraction = useApp((s) => s.setExtraction)
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<Phase>('working')
  const [result, setResult] = useState<Extraction | null>(null)
  const [attempt, setAttempt] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  // No capture to work on — someone deep-linked here.
  useEffect(() => {
    if (!pending) navigate('/home', { replace: true })
  }, [pending, navigate])

  // Depend on the source, not on `pending` — storing the extraction replaces
  // the pending object, and depending on that would abort and restart the run
  // it just finished, forever.
  const source = pending?.source

  useEffect(() => {
    if (!source) return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('working')
    setStep(0)
    setResult(null)

    void (async () => {
      try {
        const extraction = await getExtractor().extract(source, setStep, controller.signal)
        if (controller.signal.aborted) return
        setResult(extraction)
        setExtraction(extraction)
      } catch (err) {
        if (controller.signal.aborted) return
        setPhase(
          err instanceof UnreadableDropError ? 'unreadable'
          : err instanceof ExtractorNotConfiguredError ? 'unconfigured'
          : err instanceof RateLimitedError ? 'ratelimited'
          : 'failed',
        )
      }
    })()

    return () => controller.abort()
  }, [source, attempt, setExtraction])

  // Hold on "Ready." for a beat so the last extracted row is readable.
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => navigate('/review', { replace: true }), 620)
    return () => clearTimeout(t)
  }, [result, navigate])

  if (!pending) return null

  // A row lights up on schedule, but its value only appears once the reading
  // is actually back — a dash next to "Merchant" would read as "found nothing".
  const found: { k: string; v: string | null; on: boolean }[] = [
    { k: 'Merchant', v: result ? result.merchant || '—' : null, on: step >= 1 },
    { k: 'Amount', v: result ? (result.amount !== null ? peso(result.amount) : '—') : null, on: step >= 2 },
    { k: 'Date', v: result ? shortDate(result.date) : null, on: step >= 2 },
    { k: 'Category', v: result ? CATEGORIES[result.category].label : null, on: step >= 3 },
  ]

  if (phase !== 'working') {
    const COPY = {
      unreadable: {
        art: 'unreadable' as const,
        title: 'We could not read this one',
        body: 'The text was too blurry or too small. Try a closer shot, or type the details in yourself.',
        retry: true,
      },
      unconfigured: {
        art: 'unreadable' as const,
        title: 'AI reading is not set up yet',
        body: 'The server has no model key, so nothing can be read automatically. You can still add this drop by hand.',
        retry: false,
      },
      ratelimited: {
        art: 'offline' as const,
        title: 'The free limit was reached',
        body: 'The AI has read its quota for now. Wait a minute and try again, or type the details in yourself.',
        retry: true,
      },
      failed: {
        art: 'offline' as const,
        title: 'That upload did not finish',
        body: 'Check your connection and try again. Your drop is still here.',
        retry: true,
      },
    }[phase]

    return (
      <div className="screen">
        <TopBar back onBack={() => navigate('/home')} />
        <div className="scrollhost no-nav" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 300 }}>
            <Illustration art={COPY.art} />
            <h2 className="display" style={{ fontSize: 22, margin: '18px 0 8px' }}>
              {COPY.title}
            </h2>
            <p className="body2" style={{ margin: '0 0 22px' }}>
              {COPY.body}
            </p>
            {COPY.retry && (
              <Button icon="refresh" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </Button>
            )}
            <Button
              variant={COPY.retry ? 'secondary' : 'primary'}
              icon="edit"
              onClick={() => navigate('/review?manual=1', { replace: true })}
            >
              Enter the details myself
            </Button>
            <Button variant="ghost" onClick={() => navigate('/home')}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <TopBar
        back
        onBack={() => {
          abortRef.current?.abort()
          navigate('/home')
        }}
      />

      <div className="scrollhost no-nav" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 260 }}>
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            <Ripples size={190} color="var(--accent)" />
            <div
              className="anim-float"
              style={{
                position: 'relative',
                width: 132,
                height: 168,
                borderRadius: 14,
                overflow: 'hidden',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--sh-md)',
              }}
            >
              {pending.previewUrl ? (
                <img
                  src={pending.previewUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                />
              ) : (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 12 }}>
                  <Icon name="pdf" size={30} color="var(--muted)" />
                </div>
              )}
              {/* cyan scan line sweeping the drop */}
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 2,
                  background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
                  boxShadow: '0 0 12px var(--accent)',
                  animation: 'scanY 1400ms ease-in-out infinite alternate',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 19 }}>
            {CAPTIONS[Math.min(step, 4)]}
          </div>
          <div className="caption" style={{ marginTop: 5 }}>
            {pending.source.file.name}
          </div>
        </div>

        <Progress value={(Math.min(step, 4) + 1) / 5} />

        <div className="card" style={{ marginTop: 18 }}>
          <div className="seclabel" style={{ marginBottom: 6 }}>
            What LifeDrop found
          </div>
          {found.map((f, i) => (
            <div
              key={f.k}
              className="kv"
              style={{
                opacity: f.on ? 1 : 0.25,
                transition: 'opacity var(--t-standard) var(--e-out)',
                animation: f.on ? `cardIn 260ms var(--e-out) ${i * 60}ms both` : undefined,
              }}
            >
              <span className="k">{f.k}</span>
              {f.v !== null ? (
                <span className="v">{f.v}</span>
              ) : (
                <span className="skel" style={{ width: 72, height: 12, alignSelf: 'center' }} />
              )}
            </div>
          ))}
        </div>

        <p className="caption" style={{ textAlign: 'center', marginTop: 16 }}>
          You will review this before anything is saved.
        </p>
      </div>
    </div>
  )
}
