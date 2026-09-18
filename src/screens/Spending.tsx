import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/States'
import { SectionHead, TopBar, catColor } from '../components/UI'
import { Icon } from '../components/Icon'
import { useApp } from '../lib/store'
import { monthLabel, peso } from '../lib/format'
import { CATEGORIES, CATEGORY_ORDER, type Category } from '../lib/types'

/**
 * Two charts, each matched to its job:
 *
 * - Trend: one series (money out per month), so a single brand hue with the
 *   selected month at full strength. No legend — the heading names the series.
 * - Breakdown: magnitude per category as labelled meter rows. Each row carries
 *   its own name and amount, so identity never rests on hue. That matters here:
 *   the brand's seven category colours are not separable under deuteranopia
 *   (subscription violet and booking blue sit 1.3 ΔE apart), which rules out a
 *   donut or a stacked bar for this data.
 */

const MONTHS_SHOWN = 6

/** Money that actually left: receipts, plus bills and subscriptions once settled. */
function spentIn(drops: ReturnType<typeof useApp.getState>['drops'], year: number, month: number) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return drops
    .filter((d) => !d.archived && d.date.startsWith(prefix) && d.amount)
    .filter((d) => d.category === 'receipt' || d.status === 'paid')
}

export function Spending() {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const now = new Date()
  const [offset, setOffset] = useState(0) // 0 = this month, -1 = last month …

  const months = useMemo(() => {
    return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_SHOWN - 1 - i), 1)
      const items = spentIn(drops, d.getFullYear(), d.getMonth())
      return {
        offset: i - (MONTHS_SHOWN - 1),
        year: d.getFullYear(),
        month: d.getMonth(),
        short: monthLabel(d.getFullYear(), d.getMonth()).slice(0, 3),
        total: items.reduce((s, x) => s + (x.amount ?? 0), 0),
        items,
      }
    })
    // `now` is recomputed each render but only its month matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drops])

  const selected = months.find((m) => m.offset === offset) ?? months[months.length - 1]
  const peak = Math.max(...months.map((m) => m.total), 1)

  const breakdown = useMemo(() => {
    const totals = new Map<Category, number>()
    for (const d of selected.items) {
      totals.set(d.category, (totals.get(d.category) ?? 0) + (d.amount ?? 0))
    }
    return CATEGORY_ORDER.map((c) => ({ category: c, total: totals.get(c) ?? 0 }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [selected])

  // Count the headline up, per the motion spec.
  const [shown, setShown] = useState(selected.total)
  useEffect(() => {
    const from = 0
    const to = selected.total
    const start = performance.now()
    const dur = 900
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selected.total])

  const hasAny = months.some((m) => m.total > 0)

  return (
    <div className="screen">
      <TopBar title="Spending" subtitle="Receipts and settled bills" back />

      <div className="scrollhost no-nav">
        {!hasAny ? (
          <EmptyState
            art="nothing"
            title="Nothing tracked yet"
            body="Drop a receipt, or mark a bill as paid, and the total shows up here."
          />
        ) : (
          <>
            <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
              <div className="seclabel">{monthLabel(selected.year, selected.month)}</div>
              <div className="num" style={{ fontSize: 38, marginTop: 6, letterSpacing: '-1.6px' }}>
                {peso(Math.round(shown))}
              </div>
              <div className="caption" style={{ marginTop: 2 }}>
                across {selected.items.length} item{selected.items.length === 1 ? '' : 's'}
              </div>
            </div>

            <SectionHead label="Money out, last 6 months" />
            <div className="card" style={{ paddingBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 8,
                  height: 132,
                  padding: '4px 0 10px',
                }}
                role="group"
                aria-label="Monthly spending, last six months"
              >
                {months.map((m) => {
                  const on = m.offset === offset
                  return (
                    <button
                      key={m.offset}
                      onClick={() => setOffset(m.offset)}
                      aria-pressed={on}
                      aria-label={`${monthLabel(m.year, m.month)}: ${peso(m.total)}`}
                      title={`${monthLabel(m.year, m.month)} · ${peso(m.total)}`}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        height: '100%',
                        gap: 7,
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          height: `${Math.max(3, (m.total / peak) * 100)}%`,
                          borderRadius: '4px 4px 0 0',
                          background: on
                            ? 'var(--primary)'
                            : 'color-mix(in srgb, var(--primary) 34%, transparent)',
                          transition: 'background var(--t-fast) ease, height var(--t-emphasis) var(--e-out)',
                        }}
                      />
                      <span
                        className="caption"
                        style={{
                          textAlign: 'center',
                          fontWeight: on ? 700 : 500,
                          color: on ? 'var(--text)' : 'var(--muted)',
                        }}
                      >
                        {m.short}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="caption" style={{ textAlign: 'center' }}>
                Tap a month to break it down
              </div>
            </div>

            <SectionHead label={`Where it went · ${monthLabel(selected.year, selected.month)}`} />
            {breakdown.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '26px 16px' }}>
                <div className="body2">Nothing recorded for this month.</div>
              </div>
            ) : (
              <div className="card">
                {breakdown.map((r, i) => {
                  const pct = (r.total / selected.total) * 100
                  return (
                    <button
                      key={r.category}
                      onClick={() => navigate(`/vault/${r.category}`)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: i === 0 ? '0 0 14px' : '14px 0',
                        borderTop: i === 0 ? 'none' : '1px solid var(--hair)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                        <Icon name={r.category} size={15} color={catColor(r.category)} width={1.9} />
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                          {CATEGORIES[r.category].plural}
                        </span>
                        <span className="num" style={{ fontSize: 14.5 }}>
                          {peso(r.total)}
                        </span>
                        <span className="caption" style={{ width: 34, textAlign: 'right' }}>
                          {Math.round(pct)}%
                        </span>
                      </span>
                      <span
                        style={{
                          display: 'block',
                          height: 8,
                          borderRadius: 999,
                          background: 'var(--hair)',
                          overflow: 'hidden',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${pct}%`,
                            borderRadius: 999,
                            background: catColor(r.category),
                            transition: 'width var(--t-emphasis) var(--e-out)',
                          }}
                        />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            <SectionHead label={`Items · ${selected.items.length}`} />
            <div className="rows">
              {selected.items
                .slice()
                .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
                .map((d) => (
                  <button key={d.id} className="row" onClick={() => navigate(`/item/${d.id}`)}>
                    <Icon name={d.category} size={17} color={catColor(d.category)} width={1.9} />
                    <span className="mid">
                      <span className="t">{d.title}</span>
                      <span className="d">{d.merchant}</span>
                    </span>
                    <span className="num" style={{ fontSize: 14.5 }}>
                      {peso(d.amount)}
                    </span>
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
