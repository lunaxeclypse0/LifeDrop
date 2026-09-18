import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DropForm, validateDraft, type FormErrors } from '../components/DropForm'
import { Button, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { useApp } from '../lib/store'
import { REVIEW_THRESHOLD } from '../lib/extract'
import { todayISO } from '../lib/format'
import type { Extraction } from '../lib/types'

function blankDraft(): Extraction {
  return {
    title: '',
    merchant: '',
    amount: null,
    category: 'document',
    date: todayISO(),
    time: null,
    repeat: 'none',
    remindDaysBefore: null,
    reference: '',
    notes: '',
    confidence: 1,
    uncertain: [],
  }
}

export function Review() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const manual = params.get('manual') === '1'

  const pending = useApp((s) => s.pending)
  const setPending = useApp((s) => s.setPending)
  const commitPending = useApp((s) => s.commitPending)
  const updateDrop = useApp((s) => s.updateDrop)
  const showToast = useApp((s) => s.showToast)

  const initial = useMemo(
    () => (manual ? blankDraft() : (pending?.extraction ?? blankDraft())),
    [manual, pending],
  )
  const [draft, setDraft] = useState<Extraction>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  // A manual entry starts from nothing — drop whatever capture was in flight.
  useEffect(() => {
    if (manual && pending) setPending(null)
  }, [manual, pending, setPending])

  useEffect(() => {
    if (!manual && !pending) navigate('/home', { replace: true })
  }, [manual, pending, navigate])

  const lowConfidence = !manual && draft.confidence < REVIEW_THRESHOLD

  const save = async () => {
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    const drop = await commitPending(draft)

    // The user has just read every field, so their confirmation clears the flag.
    if (lowConfidence) await updateDrop(drop.id, { needsReview: false })

    navigator.vibrate?.([12, 40, 18]) // medium haptic on a successful save
    navigate(`/saved/${drop.id}`, { replace: true })
  }

  return (
    <div className="screen">
      <TopBar
        title="Review"
        subtitle={manual ? 'New drop' : 'Check before saving'}
        back
        onBack={() => navigate('/home')}
      />

      <div className="scrollhost no-nav">
        {!manual && pending && (
          <div
            className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16, padding: 12 }}
          >
            <span
              style={{
                flex: 'none',
                width: 46,
                height: 58,
                borderRadius: 9,
                overflow: 'hidden',
                background: 'var(--hair)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {pending.previewUrl ? (
                <img
                  src={pending.previewUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                />
              ) : (
                <Icon name="pdf" size={20} color="var(--muted)" />
              )}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>
                Read from {pending.source.file.name}
              </span>
              <span className="caption">
                {lowConfidence
                  ? 'LifeDrop was unsure about some fields — they are marked below.'
                  : 'Everything below can be edited.'}
              </span>
            </span>
          </div>
        )}

        {lowConfidence && (
          <div
            className="card"
            style={{
              display: 'flex',
              gap: 11,
              marginBottom: 16,
              borderColor: 'color-mix(in srgb, var(--warning) 45%, var(--border))',
              background: 'color-mix(in srgb, var(--warning) 8%, var(--surface))',
            }}
          >
            <Icon name="alert" size={19} color="var(--warning)" />
            <div className="body2" style={{ fontSize: 13.5 }}>
              Please check the amount and the date before saving.
            </div>
          </div>
        )}

        <DropForm draft={draft} onChange={setDraft} errors={errors} />

        <div style={{ marginTop: 6 }}>
          <Button onClick={save} disabled={saving} icon="check">
            {saving ? 'Saving…' : 'Save to LifeDrop'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPending(null)
              showToast('Drop discarded')
              navigate('/home')
            }}
          >
            Discard
          </Button>
        </div>
      </div>
    </div>
  )
}
