import { Icon } from './Icon'
import { Chip, Field, catColor, catTint } from './UI'
import { CATEGORIES, CATEGORY_ORDER, REPEAT_LABEL, type Extraction, type Repeat } from '../lib/types'
import { reminderLabel } from '../lib/format'

const REMINDERS = [null, 0, 1, 2, 3, 7, 14, 30, 90]

export interface FormErrors {
  title?: string
  date?: string
  amount?: string
}

export function validateDraft(draft: Extraction): FormErrors {
  const errors: FormErrors = {}
  if (!draft.title.trim()) errors.title = 'Give this drop a name.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = 'Pick a date.'
  if (draft.amount !== null && (Number.isNaN(draft.amount) || draft.amount < 0)) {
    errors.amount = 'Amount cannot be negative.'
  }
  return errors
}

export function DropForm({
  draft,
  onChange,
  errors = {},
}: {
  draft: Extraction
  onChange: (next: Extraction) => void
  errors?: FormErrors
}) {
  const set = <K extends keyof Extraction>(key: K, value: Extraction[K]) =>
    onChange({ ...draft, [key]: value })

  const unsure = (field: string) => draft.uncertain.includes(field)

  return (
    <>
      <div className="seclabel" style={{ margin: '4px 0 9px' }}>
        Category
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {CATEGORY_ORDER.map((c) => {
          const on = draft.category === c
          return (
            <button
              key={c}
              className="chip"
              aria-pressed={on}
              onClick={() => set('category', c)}
              style={{
                background: on ? catTint(c) : 'var(--surface)',
                borderColor: on ? catColor(c) : 'var(--border)',
                color: on ? catColor(c) : 'var(--text2)',
                fontWeight: on ? 700 : 600,
              }}
            >
              <Icon name={c} size={14} width={1.9} />
              {CATEGORIES[c].label}
            </button>
          )
        })}
      </div>

      <Field label="Title" error={errors.title}>
        <input
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Internet Bill"
        />
      </Field>

      <Field label={draft.category === 'receipt' ? 'Merchant' : 'Provider'}>
        <input
          value={draft.merchant}
          onChange={(e) => set('merchant', e.target.value)}
          placeholder="Globe Fiber"
        />
      </Field>

      <Field
        label={unsure('amount') ? 'Amount · please check' : 'Amount'}
        error={errors.amount}
      >
        <span style={{ color: 'var(--muted)', fontWeight: 700 }}>&#8369;</span>
        <input
          value={draft.amount === null ? '' : String(draft.amount)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, '')
            set('amount', raw === '' ? null : Number(raw))
          }}
          placeholder="Leave blank if none"
          inputMode="decimal"
        />
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={unsure('date') ? 'Date · please check' : 'Date'} error={errors.date}>
            <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Time">
            <input
              type="time"
              value={draft.time ?? ''}
              onChange={(e) => set('time', e.target.value || null)}
            />
          </Field>
        </div>
      </div>

      <div className="seclabel" style={{ margin: '6px 0 9px' }}>
        Repeats
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
          <Chip key={r} label={REPEAT_LABEL[r]} on={draft.repeat === r} onClick={() => set('repeat', r)} />
        ))}
      </div>

      <div className="seclabel" style={{ margin: '6px 0 9px' }}>
        Remind me
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {REMINDERS.map((r) => (
          <Chip
            key={String(r)}
            label={reminderLabel(r)}
            on={draft.remindDaysBefore === r}
            onClick={() => set('remindDaysBefore', r)}
          />
        ))}
      </div>

      <Field label="Reference">
        <input
          value={draft.reference}
          onChange={(e) => set('reference', e.target.value)}
          placeholder="Account or booking number"
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Anything worth remembering"
        />
      </Field>
    </>
  )
}
