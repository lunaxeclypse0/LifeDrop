import { useMemo, useState } from 'react'
import { DropCard } from '../components/DropCard'
import { EmptyState } from '../components/States'
import { Chip, TopBar, catColor } from '../components/UI'
import { Icon } from '../components/Icon'
import { byDate, liveDrops, useApp } from '../lib/store'
import { longDate, monthLabel, todayISO, toISO } from '../lib/format'
import type { Drop } from '../lib/types'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function CalendarScreen() {
  const drops = useApp((s) => s.drops)
  const today = todayISO()
  const now = new Date()

  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(today)

  const byDay = useMemo(() => {
    const map = new Map<string, Drop[]>()
    for (const d of liveDrops(drops)) {
      const list = map.get(d.date) ?? []
      list.push(d)
      map.set(d.date, list)
    }
    for (const list of map.values()) list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
    return map
  }, [drops])

  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const lead = first.getDay()
    const days = new Date(year, month + 1, 0).getDate()
    const total = Math.ceil((lead + days) / 7) * 7
    return Array.from({ length: total }, (_, i) => {
      const dayNum = i - lead + 1
      if (dayNum < 1 || dayNum > days) return null
      return toISO(new Date(year, month, dayNum))
    })
  }, [year, month])

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelected(null)
  }

  const dayItems = selected ? (byDay.get(selected) ?? []) : []

  const agenda = useMemo(() => {
    const upcoming = liveDrops(drops)
      .filter((d) => d.date >= today)
      .sort(byDate)
    const groups: { label: string; items: Drop[] }[] = [
      { label: 'This week', items: [] },
      { label: 'Next 30 days', items: [] },
      { label: 'Later', items: [] },
    ]
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 7)
    const monthEnd = new Date()
    monthEnd.setDate(monthEnd.getDate() + 30)
    for (const d of upcoming) {
      if (d.date <= toISO(weekEnd)) groups[0].items.push(d)
      else if (d.date <= toISO(monthEnd)) groups[1].items.push(d)
      else groups[2].items.push(d)
    }
    return groups.filter((g) => g.items.length)
  }, [drops, today])

  return (
    <div className="screen">
      <TopBar
        title="Calendar"
        right={
          <button
            className="iconbtn"
            onClick={() => setView(view === 'month' ? 'agenda' : 'month')}
            aria-label={view === 'month' ? 'Switch to agenda' : 'Switch to month'}
          >
            <Icon name={view === 'month' ? 'list' : 'calendar'} size={20} />
          </button>
        }
      />

      <div className="scrollhost nsb">
        {view === 'month' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <button className="iconbtn plain" onClick={() => step(-1)} aria-label="Previous month">
                <Icon name="back" size={18} />
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 15.5, fontWeight: 700 }}>
                {monthLabel(year, month)}
              </div>
              <button className="iconbtn plain" onClick={() => step(1)} aria-label="Next month">
                <Icon name="chev" size={18} />
              </button>
            </div>

            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                {DOW.map((d, i) => (
                  <div key={i} className="caption" style={{ textAlign: 'center', fontWeight: 700 }}>
                    {d}
                  </div>
                ))}
              </div>
              <div
                key={`${year}-${month}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  animation: 'fadeIn 240ms var(--e-out) both',
                }}
              >
                {cells.map((iso, i) => {
                  if (!iso) return <span key={i} style={{ height: 44 }} />
                  const items = byDay.get(iso) ?? []
                  const isToday = iso === today
                  const isSel = iso === selected
                  return (
                    <button
                      key={iso}
                      onClick={() => setSelected(iso)}
                      aria-label={`${longDate(iso)}, ${items.length} item${items.length === 1 ? '' : 's'}`}
                      aria-pressed={isSel}
                      style={{
                        height: 44,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                        borderRadius: 12,
                        background: isSel ? 'var(--primary)' : 'transparent',
                        color: isSel ? '#fff' : 'var(--text)',
                        fontWeight: isToday || isSel ? 800 : 500,
                        fontSize: 14,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Manrope, sans-serif',
                          textDecoration: isToday && !isSel ? 'underline' : 'none',
                          textUnderlineOffset: 3,
                          textDecorationColor: 'var(--primary)',
                        }}
                      >
                        {Number(iso.slice(8))}
                      </span>
                      <span style={{ display: 'flex', gap: 2, height: 4 }}>
                        {items.slice(0, 3).map((it) => (
                          <i
                            key={it.id}
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: 999,
                              background: isSel ? '#fff' : catColor(it.category),
                            }}
                          />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="sechead">
              <span className="seclabel">{selected ? longDate(selected) : 'Pick a day'}</span>
              {selected === today && <span className="caption">Today</span>}
            </div>

            {dayItems.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '26px 16px' }}>
                <div className="body2">Nothing scheduled.</div>
              </div>
            ) : (
              dayItems.map((d, i) => (
                <div key={d.id} style={{ marginBottom: 10 }}>
                  <DropCard drop={d} index={i} />
                </div>
              ))
            )}
          </>
        ) : agenda.length === 0 ? (
          <EmptyState art="nothing" title="Nothing ahead" body="Dated drops show up here automatically." />
        ) : (
          agenda.map((g) => (
            <div key={g.label}>
              <div className="sechead">
                <span className="seclabel">{g.label}</span>
                <Chip label={`${g.items.length}`} />
              </div>
              {g.items.map((d, i) => (
                <div key={d.id} style={{ marginBottom: 10 }}>
                  <DropCard drop={d} index={i} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
