import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DropCard } from '../components/DropCard'
import { EmptyState } from '../components/States'
import { Icon } from '../components/Icon'
import { Button, SectionHead, Tile, TopBar, catColor, catTint } from '../components/UI'
import { byNewest, liveDrops, useApp } from '../lib/store'
import { CATEGORIES, CATEGORY_ORDER, type Category } from '../lib/types'
import { daysUntil, peso, shortDate, whenLine } from '../lib/format'

export function Vault({ onDrop }: { onDrop: () => void }) {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const live = useMemo(() => liveDrops(drops), [drops])

  const counts = useMemo(() => {
    const out = {} as Record<Category, { n: number; total: number }>
    for (const c of CATEGORY_ORDER) out[c] = { n: 0, total: 0 }
    for (const d of live) {
      out[d.category].n++
      out[d.category].total += d.amount ?? 0
    }
    return out
  }, [live])

  // Warranties and documents that lapse within three months, soonest first.
  const expiring = useMemo(
    () =>
      live
        .filter((d) => d.category === 'warranty' || d.category === 'document')
        .filter((d) => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 120)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [live],
  )

  const archivedCount = drops.filter((d) => d.archived).length

  return (
    <div className="screen">
      <TopBar
        title="Vault"
        subtitle={`${live.length} item${live.length === 1 ? '' : 's'} kept`}
        right={
          <button className="iconbtn" onClick={() => navigate('/search')} aria-label="Search">
            <Icon name="search" size={20} />
          </button>
        }
      />

      <div className="scrollhost nsb">
        {live.length === 0 ? (
          <EmptyState
            art="vault"
            title="Your vault is empty"
            body="Saved drops are filed here by category, ready when you need them."
            action={
              <Button onClick={onDrop} icon="plus" style={{ width: 'auto', padding: '14px 22px' }}>
                Drop something
              </Button>
            }
          />
        ) : (
          <>
            <SectionHead label="Categories" first />
            <div className="grid2">
              {CATEGORY_ORDER.filter((c) => counts[c].n > 0).map((c) => (
                <button
                  key={c}
                  className="card"
                  onClick={() => navigate(`/vault/${c}`)}
                  style={{ textAlign: 'left', padding: 14 }}
                >
                  <Tile category={c} />
                  <div style={{ marginTop: 10, fontSize: 14.5, fontWeight: 700 }}>
                    {CATEGORIES[c].plural}
                  </div>
                  <div className="caption">
                    {counts[c].n} item{counts[c].n === 1 ? '' : 's'}
                    {counts[c].total > 0 && ` · ${peso(counts[c].total)}`}
                  </div>
                </button>
              ))}
            </div>

            {expiring.length > 0 && (
              <>
                <SectionHead label="Expiring soon" />
                {expiring.map((d, i) => (
                  <div key={d.id} style={{ marginBottom: 10 }}>
                    <DropCard drop={d} index={i} />
                  </div>
                ))}
              </>
            )}

            {archivedCount > 0 && (
              <button
                className="card"
                onClick={() => navigate('/vault/archived')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginTop: 18 }}
              >
                <Tile icon="inbox" color="var(--muted)" size="sm" />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Archived</span>
                <span className="caption">{archivedCount}</span>
                <Icon name="chev" size={17} color="var(--muted)" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function VaultCategory() {
  const { category } = useParams<{ category: string }>()
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const setArchived = useApp((s) => s.setArchived)
  const showToast = useApp((s) => s.showToast)
  const [grid, setGrid] = useState(false)

  const archived = category === 'archived'
  const cat = archived ? null : (category as Category)
  const valid = archived || (cat && cat in CATEGORIES)

  const items = useMemo(() => {
    if (!valid) return []
    const list = archived ? drops.filter((d) => d.archived) : liveDrops(drops).filter((d) => d.category === cat)
    return [...list].sort(byNewest)
  }, [drops, cat, archived, valid])

  const total = items.reduce((s, d) => s + (d.amount ?? 0), 0)
  const title = archived ? 'Archived' : valid ? CATEGORIES[cat as Category].plural : 'Not found'

  if (!valid) {
    return (
      <div className="screen">
        <TopBar title="Not found" back />
        <div className="scrollhost">
          <EmptyState art="nothing" title="No such category" body="That part of the vault does not exist." />
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <TopBar
        title={title}
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'}${total > 0 ? ` · ${peso(total)} tracked` : ''}`}
        back
        right={
          !archived ? (
            <button
              className="iconbtn"
              onClick={() => setGrid(!grid)}
              aria-label={grid ? 'Switch to list' : 'Switch to grid'}
            >
              <Icon name={grid ? 'list' : 'grid'} size={20} />
            </button>
          ) : undefined
        }
      />

      <div className="scrollhost nsb">
        {items.length === 0 ? (
          <EmptyState
            art={archived ? 'inbox' : 'vault'}
            title={archived ? 'Nothing archived' : 'Nothing filed here yet'}
            body={
              archived
                ? 'Swipe a drop left in your Inbox to archive it.'
                : 'Drops of this kind will collect here.'
            }
            action={
              <Button variant="secondary" onClick={() => navigate('/vault')} style={{ width: 'auto', padding: '13px 20px' }}>
                Back to Vault
              </Button>
            }
          />
        ) : grid ? (
          <div className="grid2">
            {items.map((d, i) => (
              <button
                key={d.id}
                className="card"
                onClick={() => navigate(`/item/${d.id}`)}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  animation: 'cardIn 240ms var(--e-out) both',
                  animationDelay: `${Math.min(i, 8) * 45}ms`,
                }}
              >
                <span
                  style={{
                    height: 62,
                    borderRadius: 11,
                    background: catTint(d.category),
                    display: 'grid',
                    placeItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Icon name={d.category} size={24} color={catColor(d.category)} />
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d.title}
                </span>
                <span className="caption" style={{ display: 'block' }}>
                  {d.amount !== null ? peso(d.amount) : shortDate(d.date)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          items.map((d, i) => (
            <div key={d.id} style={{ marginBottom: 10 }}>
              <DropCard drop={d} index={i} />
              {archived && (
                <button
                  className="btn ghost sm"
                  style={{ justifyContent: 'flex-start', paddingLeft: 14 }}
                  onClick={() => {
                    void setArchived(d.id, false)
                    showToast(`${d.title} restored · ${whenLine(d)}`)
                  }}
                >
                  <Icon name="refresh" size={15} width={2} />
                  Restore to Inbox
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
