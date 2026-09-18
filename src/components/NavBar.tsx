import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import type { IconName } from '../lib/icons'
import { needsReviewDrops, useApp } from '../lib/store'

const TABS: { to: string; icon: IconName; label: string }[] = [
  { to: '/home', icon: 'home', label: 'Home' },
  { to: '/inbox', icon: 'inbox', label: 'Inbox' },
  { to: '/calendar', icon: 'calendar', label: 'Calendar' },
  { to: '/vault', icon: 'vault', label: 'Vault' },
]

export function NavBar({ onDrop }: { onDrop: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const reviewCount = useApp((s) => needsReviewDrops(s.drops).length)

  const tab = (t: (typeof TABS)[number]) => {
    const on = pathname === t.to || pathname.startsWith(t.to + '/')
    return (
      <button
        key={t.to}
        className={on ? 'on' : ''}
        aria-current={on ? 'page' : undefined}
        onClick={() => navigate(t.to)}
      >
        <span className="navwrap">
          <Icon name={t.icon} size={22} width={on ? 2 : 1.7} />
          {t.to === '/inbox' && reviewCount > 0 && <i className="navdot" />}
        </span>
        <span>{t.label}</span>
      </button>
    )
  }

  return (
    <nav className="nav" aria-label="Main">
      {tab(TABS[0])}
      {tab(TABS[1])}
      <button className="dropbtn" onClick={onDrop} aria-label="Drop something">
        <Icon name="plus" size={26} color="#fff" width={2.2} />
      </button>
      {tab(TABS[2])}
      {tab(TABS[3])}
    </nav>
  )
}
