import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SwipeRow } from '../components/DropCard'
import { EmptyState } from '../components/States'
import { BottomSheet } from '../components/Sheet'
import { Button, Chip, Toggle, TopBar } from '../components/UI'
import { Icon } from '../components/Icon'
import { byAmount, byDate, byNewest, liveDrops, useApp } from '../lib/store'
import { CATEGORIES, CATEGORY_ORDER, type Category } from '../lib/types'
import { shortDate } from '../lib/format'

type Sort = 'newest' | 'due' | 'amount'

const SORTS: { key: Sort; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'due', label: 'Due soonest' },
  { key: 'amount', label: 'Largest amount' },
]

export function Inbox({ onDrop }: { onDrop: () => void }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const drops = useApp((s) => s.drops)
  const setArchived = useApp((s) => s.setArchived)
  const updateDrop = useApp((s) => s.updateDrop)
  const showToast = useApp((s) => s.showToast)

  const filter = params.get('filter') ?? 'all'
  const [sort, setSort] = useState<Sort>('newest')
  const [onlyReview, setOnlyReview] = useState(false)
  const [sheet, setSheet] = useState(false)

  const setFilter = (next: string) => {
    if (next === 'all') setParams({}, { replace: true })
    else setParams({ filter: next }, { replace: true })
  }

  const items = useMemo(() => {
    let list = liveDrops(drops)
    if (filter === 'review') list = list.filter((d) => d.needsReview)
    else if (filter !== 'all') list = list.filter((d) => d.category === filter)
    if (onlyReview) list = list.filter((d) => d.needsReview)

    const cmp = sort === 'due' ? byDate : sort === 'amount' ? byAmount : byNewest
    return [...list].sort(cmp)
  }, [drops, filter, sort, onlyReview])

  const counts = useMemo(() => {
    const live = liveDrops(drops)
    const out: Record<string, number> = { all: live.length, review: live.filter((d) => d.needsReview).length }
    for (const c of CATEGORY_ORDER) out[c] = live.filter((d) => d.category === c).length
    return out
  }, [drops])

  const archive = (id: string, title: string) => {
    void setArchived(id, true)
    showToast(`${title} archived`, {
      label: 'Undo',
      run: () => void setArchived(id, false),
    })
  }

  const remind = (id: string, date: string) => {
    void updateDrop(id, { remindDaysBefore: 1 }, 'Reminder set')
    showToast(`Reminder set for the day before ${shortDate(date)}`)
  }

  return (
    <div className="screen">
      <TopBar
        title="Smart Inbox"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'}`}
        right={
          <>
            <button className="iconbtn" onClick={() => navigate('/search')} aria-label="Search">
              <Icon name="search" size={20} />
            </button>
            <button className="iconbtn" onClick={() => setSheet(true)} aria-label="Filter and sort">
              <Icon name="sliders" size={20} />
            </button>
          </>
        }
      />

      <div className="chiprow nsb" style={{ flex: 'none' }}>
        <Chip label="All" on={filter === 'all'} count={counts.all} onClick={() => setFilter('all')} />
        {counts.review > 0 && (
          <Chip
            label="Needs Review"
            on={filter === 'review'}
            count={counts.review}
            onClick={() => setFilter('review')}
          />
        )}
        {CATEGORY_ORDER.filter((c) => counts[c] > 0).map((c: Category) => (
          <Chip
            key={c}
            label={CATEGORIES[c].plural}
            on={filter === c}
            count={counts[c]}
            onClick={() => setFilter(c)}
          />
        ))}
      </div>

      <div className="scrollhost nsb">
        {items.length === 0 ? (
          <EmptyState
            art="inbox"
            title={filter === 'all' ? 'Your inbox is clear' : 'Nothing here'}
            body={
              filter === 'all'
                ? 'Everything you drop lands here first, already sorted.'
                : 'No drops match this filter yet.'
            }
            action={
              filter === 'all' ? (
                <Button onClick={onDrop} icon="plus" style={{ width: 'auto', padding: '14px 22px' }}>
                  Drop something
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter('all')
                    setOnlyReview(false)
                  }}
                  style={{ width: 'auto', padding: '13px 20px' }}
                >
                  Clear filter
                </Button>
              )
            }
          />
        ) : (
          items.map((d, i) => (
            <SwipeRow
              key={d.id}
              drop={d}
              index={i}
              onRemind={() => remind(d.id, d.date)}
              onArchive={() => archive(d.id, d.title)}
            />
          ))
        )}
      </div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Filter and sort">
        <div className="seclabel" style={{ margin: '14px 0 10px' }}>
          Sort by
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} on={sort === s.key} onClick={() => setSort(s.key)} />
          ))}
        </div>

        <div className="row" style={{ marginTop: 18, padding: '15px 0', borderBottom: 0 }}>
          <div className="mid">
            <div className="t">Needs review only</div>
            <div className="d">Show drops LifeDrop was unsure about</div>
          </div>
          <Toggle on={onlyReview} onChange={setOnlyReview} label="Needs review only" />
        </div>

        <Button onClick={() => setSheet(false)}>Show {items.length} items</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSort('newest')
            setOnlyReview(false)
            setFilter('all')
          }}
        >
          Reset filters
        </Button>
      </BottomSheet>
    </div>
  )
}
