import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DropCard } from '../components/DropCard'
import { EmptyState } from '../components/States'
import { Icon } from '../components/Icon'
import { Chip, SectionHead } from '../components/UI'
import { searchDrops, useApp } from '../lib/store'
import { CATEGORIES, CATEGORY_ORDER } from '../lib/types'

const RECENT_KEY = 'lifedrop.recentSearches'

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

export function Search() {
  const navigate = useNavigate()
  const drops = useApp((s) => s.drops)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(readRecent)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => searchDrops(drops, query), [drops, query])

  const remember = (term: string) => {
    const trimmed = term.trim()
    if (trimmed.length < 2) return
    const next = [trimmed, ...recent.filter((r) => r !== trimmed)].slice(0, 6)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* private mode — history just does not persist */
    }
  }

  const suggestions = CATEGORY_ORDER.filter((c) => drops.some((d) => d.category === c && !d.archived))

  return (
    <div className="screen">
      <header className="topbar">
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Go back">
          <Icon name="back" size={20} />
        </button>
        <div className="searchbar" style={{ flex: 1 }}>
          <Icon name="search" size={18} color="var(--muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && remember(query)}
            placeholder="Search drops, merchants, amounts"
            type="search"
            aria-label="Search"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" size={17} color="var(--muted)" width={2} />
            </button>
          )}
        </div>
      </header>

      <div className="scrollhost nsb no-nav">
        {!query.trim() ? (
          <>
            {recent.length > 0 && (
              <>
                <SectionHead
                  label="Recent searches"
                  action="Clear"
                  first
                  onAction={() => {
                    setRecent([])
                    try {
                      localStorage.removeItem(RECENT_KEY)
                    } catch {
                      /* nothing to clear */
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {recent.map((r) => (
                    <Chip key={r} label={r} onClick={() => setQuery(r)} />
                  ))}
                </div>
              </>
            )}

            <SectionHead label="Browse by category" first={recent.length === 0} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {suggestions.map((c) => (
                <Chip key={c} label={CATEGORIES[c].plural} onClick={() => navigate(`/vault/${c}`)} />
              ))}
            </div>
          </>
        ) : results.length === 0 ? (
          <EmptyState
            art="search"
            title="No matches"
            body={`Nothing in your vault matches "${query.trim()}". Try a merchant name or an amount.`}
          />
        ) : (
          <>
            <div className="sechead first">
              <span className="seclabel">
                {results.length} result{results.length === 1 ? '' : 's'}
              </span>
            </div>
            {results.map((d, i) => (
              <div key={d.id} style={{ marginBottom: 10 }}>
                <DropCard drop={d} index={i} onClick={() => {
                  remember(query)
                  navigate(`/item/${d.id}`)
                }} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
