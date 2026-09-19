/**
 * Voice in and out, using what the browser already has.
 *
 * `SpeechRecognition` and `speechSynthesis` are built in — no key, no server,
 * no quota. Recognition is still prefixed in every shipping browser, and on
 * iOS it exists only in Safari, so both are treated as optional.
 */

type RecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function voiceInputSupported(): boolean {
  return ctor() !== null
}

export function voiceOutputSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export type ListenError = 'denied' | 'no-speech' | 'network' | 'unsupported' | 'failed'

export interface Listener {
  stop: () => void
}

/**
 * Starts listening. `onPartial` fires as the user speaks so the UI can show
 * words landing; `onFinal` fires once with the finished sentence.
 *
 * Philippine English is the default because that is what the app is for, and
 * it handles Taglish far better than plain en-US.
 */
export function listen(opts: {
  onPartial?: (text: string) => void
  onFinal: (text: string) => void
  onError: (err: ListenError) => void
  lang?: string
}): Listener | null {
  const Ctor = ctor()
  if (!Ctor) {
    opts.onError('unsupported')
    return null
  }

  const rec = new Ctor()
  rec.lang = opts.lang ?? 'en-PH'
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1

  let best = ''
  let settled = false

  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const alt = e.results[i][0]
      if (!alt) continue
      if (e.results[i].isFinal) best += alt.transcript
      else interim += alt.transcript
    }
    opts.onPartial?.((best + interim).trim())
  }

  rec.onerror = (e) => {
    if (settled) return
    settled = true
    const map: Record<string, ListenError> = {
      'not-allowed': 'denied',
      'service-not-allowed': 'denied',
      'no-speech': 'no-speech',
      network: 'network',
    }
    opts.onError(map[e.error] ?? 'failed')
  }

  rec.onend = () => {
    if (settled) return
    settled = true
    const text = best.trim()
    if (text) opts.onFinal(text)
    else opts.onError('no-speech')
  }

  try {
    rec.start()
  } catch {
    settled = true
    opts.onError('failed')
    return null
  }

  return {
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    },
  }
}

// ---------------------------------------------------------------------------
// speaking
// ---------------------------------------------------------------------------

/**
 * Picks the closest thing to a Philippine or British English voice. The
 * default US voice mangles peso amounts and Filipino place names.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  if (!voices.length) return null
  return (
    voices.find((v) => v.lang === 'en-PH') ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  )
}

export function speak(text: string, opts: { onEnd?: () => void } = {}): void {
  if (!voiceOutputSupported() || !text.trim()) {
    opts.onEnd?.()
    return
  }
  speechSynthesis.cancel() // never let two utterances overlap

  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice()
  if (v) {
    u.voice = v
    u.lang = v.lang
  }
  u.rate = 1.02
  u.pitch = 1
  u.onend = () => opts.onEnd?.()
  u.onerror = () => opts.onEnd?.()
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (voiceOutputSupported()) speechSynthesis.cancel()
}

/**
 * Voice lists load asynchronously in Chrome — the first `getVoices()` is
 * often empty. Warming it once at startup means the first spoken reply is
 * not stuck with the default voice.
 */
export function warmVoices(): void {
  if (!voiceOutputSupported()) return
  speechSynthesis.getVoices()
  speechSynthesis.addEventListener('voiceschanged', () => speechSynthesis.getVoices(), { once: true })
}

/** "₱3,420.50" reads badly; "3,420 pesos and 50 centavos" does not. */
export function sayAmount(amount: number): string {
  const whole = Math.floor(Math.abs(amount))
  const cents = Math.round((Math.abs(amount) - whole) * 100)
  const pesos = `${whole.toLocaleString('en-PH')} peso${whole === 1 ? '' : 's'}`
  if (!cents) return pesos
  return `${pesos} and ${cents} centavo${cents === 1 ? '' : 's'}`
}
