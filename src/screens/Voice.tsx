import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { DropCard } from '../components/DropCard'
import { Ripples } from '../components/Brand'
import { Button, TopBar } from '../components/UI'
import { useApp } from '../lib/store'
import { listen, speak, stopSpeaking, voiceInputSupported, voiceOutputSupported, type Listener } from '../lib/speech'
import { answer, VOICE_EXAMPLES, type Answer, type VoiceIntent } from '../lib/assistant'
import { todayISO } from '../lib/format'
import type { Extraction } from '../lib/types'

type Phase = 'idle' | 'listening' | 'thinking' | 'answered' | 'error'

const ERRORS: Record<string, string> = {
  denied: 'LifeDrop needs microphone access. Allow it in your browser settings and try again.',
  'no-speech': "I did not catch that. Try again, a little closer to the phone.",
  network: 'Speech needs a connection right now. Check yours and try again.',
  unsupported: 'This browser cannot listen. On iPhone, use Safari; on Android, use Chrome.',
  failed: 'Something went wrong listening. Try again.',
}

export function Voice() {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const setPending = useApp((s) => s.setPending)

  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const listener = useRef<Listener | null>(null)

  const supported = voiceInputSupported()

  useEffect(() => {
    return () => {
      listener.current?.stop()
      stopSpeaking()
    }
  }, [])

  const route = useCallback(
    async (intent: VoiceIntent) => {
      if (intent.kind === 'drop') {
        // A spoken drop skips extraction entirely — the words *are* the reading.
        const draft: Extraction = {
          title: intent.title || 'Untitled drop',
          merchant: intent.merchant,
          amount: intent.amount,
          category: (intent.category || 'document') as Extraction['category'],
          date: intent.date || todayISO(),
          time: intent.time || null,
          repeat: (intent.repeat || 'none') as Extraction['repeat'],
          remindDaysBefore: null,
          reference: intent.reference,
          notes: '',
          confidence: 1,
          uncertain: [],
        }
        const file = new File([intent.transcript], 'spoken-note.txt', { type: 'text/plain' })
        setPending({ source: { file, kind: 'manual' }, previewUrl: null, extraction: draft })
        if (!muted) speak(`Got it. ${draft.title}. Check the details before I save it.`)
        navigate('/review?spoken=1')
        return
      }

      if (intent.kind === 'search') {
        navigate(`/search?q=${encodeURIComponent(intent.query || intent.transcript)}`)
        return
      }

      if (intent.kind === 'unknown') {
        const say = intent.say || 'I can tell you what you have spent, what you owe, or what is coming up.'
        setReply({ speech: say })
        setPhase('answered')
        if (!muted) speak(say)
        return
      }

      const a = answer(intent, drops)
      setReply(a)
      setPhase('answered')
      if (!muted) speak(a.speech)
    },
    [drops, muted, navigate, setPending],
  )

  const ask = useCallback(
    async (transcript: string) => {
      setPhase('thinking')
      try {
        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transcript, today: todayISO() }),
        })
        if (res.status === 503) throw new Error('Voice needs the AI key set on the server.')
        if (res.status === 429) throw new Error('The free limit was reached. Try again in a minute.')
        if (!res.ok) throw new Error('I could not work out what you meant.')
        await route((await res.json()) as VoiceIntent)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        setPhase('error')
      }
    },
    [route],
  )

  const start = () => {
    stopSpeaking()
    setHeard('')
    setReply(null)
    setError(null)
    setPhase('listening')
    navigator.vibrate?.(10)

    listener.current = listen({
      onPartial: setHeard,
      onFinal: (text) => {
        setHeard(text)
        void ask(text)
      },
      onError: (err) => {
        setError(ERRORS[err] ?? ERRORS.failed)
        setPhase('error')
      },
    })
  }

  const stop = () => {
    listener.current?.stop()
    listener.current = null
  }

  if (!supported) {
    return (
      <div className="screen">
        <TopBar title="Ask LifeDrop" back />
        <div className="scrollhost no-nav" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 300 }}>
            <Icon name="alert" size={34} color="var(--warning)" />
            <h2 className="display" style={{ fontSize: 21, margin: '16px 0 8px' }}>
              This browser cannot listen
            </h2>
            <p className="body2" style={{ margin: '0 0 22px' }}>
              Voice needs Safari on iPhone, or Chrome on Android and desktop. Everything else in
              LifeDrop still works here.
            </p>
            <Button variant="secondary" onClick={() => navigate('/home')}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const busy = phase === 'listening' || phase === 'thinking'

  return (
    <div className="screen">
      <TopBar
        title="Ask LifeDrop"
        back
        onBack={() => {
          stop()
          stopSpeaking()
          navigate(-1)
        }}
        right={
          voiceOutputSupported() ? (
            <button
              className="iconbtn"
              aria-label={muted ? 'Turn spoken replies on' : 'Turn spoken replies off'}
              aria-pressed={muted}
              onClick={() => {
                if (!muted) stopSpeaking()
                setMuted(!muted)
              }}
            >
              <Icon name={muted ? 'speakerOff' : 'speaker'} size={20} />
            </button>
          ) : undefined
        }
      />

      <div className="scrollhost no-nav" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 230, padding: '10px 0' }}>
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            {phase === 'listening' && <Ripples size={190} color="var(--accent)" />}
            <button
              onClick={phase === 'listening' ? stop : start}
              aria-label={phase === 'listening' ? 'Stop listening' : 'Start listening'}
              style={{
                position: 'relative',
                width: 104,
                height: 104,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                background: phase === 'listening' ? 'var(--danger)' : 'var(--brand-grad)',
                boxShadow: '0 14px 30px -12px color-mix(in srgb, var(--primary) 80%, transparent)',
                transition: 'background var(--t-standard) ease',
              }}
            >
              {phase === 'thinking' ? (
                <span
                  className="anim-spin"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: '3px solid rgba(255,255,255,.35)',
                    borderTopColor: '#fff',
                  }}
                />
              ) : (
                <Icon name={phase === 'listening' ? 'close' : 'mic'} size={40} color="#fff" width={1.9} />
              )}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', minHeight: 64 }}>
          {phase === 'idle' && <div className="body2">Tap the mic and ask me anything.</div>}
          {phase === 'listening' && (
            <>
              <div className="display" style={{ fontSize: 17 }}>
                Listening…
              </div>
              <div className="body2" style={{ marginTop: 6, minHeight: 22 }}>
                {heard || 'Go ahead.'}
              </div>
            </>
          )}
          {phase === 'thinking' && (
            <>
              <div className="display" style={{ fontSize: 17 }}>
                Working it out…
              </div>
              <div className="body2" style={{ marginTop: 6 }}>
                “{heard}”
              </div>
            </>
          )}
          {phase === 'error' && (
            <div className="body2" style={{ color: 'var(--danger)', fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        {phase === 'answered' && reply && (
          <div style={{ animation: 'cardIn 260ms var(--e-out) both' }}>
            <div className="caption" style={{ textAlign: 'center', marginBottom: 12 }}>
              “{heard}”
            </div>
            <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent' }}>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, fontWeight: 600 }}>{reply.speech}</p>
            </div>

            {reply.items?.map((d, i) => (
              <div key={d.id} style={{ marginTop: 10 }}>
                <DropCard drop={d} index={i} />
              </div>
            ))}

            <div style={{ marginTop: 16 }}>
              {reply.goTo && (
                <Button variant="secondary" icon="chev" onClick={() => navigate(reply.goTo!)}>
                  Open it
                </Button>
              )}
              {!muted && (
                <Button variant="secondary" icon="speaker" onClick={() => speak(reply.speech)}>
                  Say it again
                </Button>
              )}
              <Button variant="ghost" icon="mic" onClick={start}>
                Ask something else
              </Button>
            </div>
          </div>
        )}

        {(phase === 'idle' || phase === 'error') && (
          <div style={{ marginTop: 10 }}>
            <div className="seclabel" style={{ marginBottom: 10, textAlign: 'center' }}>
              Try saying
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {VOICE_EXAMPLES.map((e) => (
                <span key={e} className="chip" style={{ cursor: 'default' }}>
                  {e}
                </span>
              ))}
            </div>
          </div>
        )}

        {busy && (
          <div style={{ marginTop: 18 }}>
            <Button variant="ghost" onClick={stop}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
