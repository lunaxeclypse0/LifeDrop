import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DropForm, validateDraft, type FormErrors } from '../components/DropForm'
import { Button, TopBar } from '../components/UI'
import { useApp } from '../lib/store'
import type { Extraction } from '../lib/types'

export function EditDrop() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const drop = useApp((s) => s.drops.find((d) => d.id === id))
  const updateDrop = useApp((s) => s.updateDrop)
  const showToast = useApp((s) => s.showToast)

  const [draft, setDraft] = useState<Extraction | null>(
    drop
      ? {
          title: drop.title,
          merchant: drop.merchant,
          amount: drop.amount,
          category: drop.category,
          date: drop.date,
          time: drop.time,
          repeat: drop.repeat,
          remindDaysBefore: drop.remindDaysBefore,
          reference: drop.reference,
          notes: drop.notes,
          confidence: 1,
          uncertain: [],
        }
      : null,
  )
  const [errors, setErrors] = useState<FormErrors>({})

  if (!drop || !draft) {
    navigate('/home', { replace: true })
    return null
  }

  const save = async () => {
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length) return

    await updateDrop(
      drop.id,
      {
        title: draft.title.trim(),
        merchant: draft.merchant.trim(),
        amount: draft.amount,
        category: draft.category,
        date: draft.date,
        time: draft.time,
        repeat: draft.repeat,
        remindDaysBefore: draft.remindDaysBefore,
        reference: draft.reference.trim(),
        notes: draft.notes.trim(),
        // Editing by hand is the review.
        needsReview: false,
      },
      'Edited by you',
    )
    showToast('Changes saved')
    navigate(`/item/${drop.id}`, { replace: true })
  }

  return (
    <div className="screen">
      <TopBar title="Edit drop" subtitle={drop.fileName} back />
      <div className="scrollhost no-nav">
        <DropForm draft={draft} onChange={setDraft} errors={errors} />
        <div style={{ marginTop: 6 }}>
          <Button icon="check" onClick={save}>
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
