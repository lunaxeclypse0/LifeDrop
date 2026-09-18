import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import type { IconName } from '../lib/icons'
import { CATEGORIES, STATUS_LABEL, type Category, type Status } from '../lib/types'

export const catColor = (c: Category) => `var(${CATEGORIES[c].varName})`
export const catTint = (c: Category) =>
  `color-mix(in srgb, var(${CATEGORIES[c].varName}) var(--tint), transparent)`

// ---------------------------------------------------------------------------

export function TopBar({
  title,
  subtitle,
  back,
  onBack,
  right,
  bordered,
}: {
  title?: ReactNode
  subtitle?: string
  back?: boolean
  onBack?: () => void
  right?: ReactNode
  bordered?: boolean
}) {
  const navigate = useNavigate()
  return (
    <header className={`topbar${bordered ? ' bordered' : ''}`}>
      {back && (
        <button
          className="iconbtn"
          onClick={() => (onBack ? onBack() : navigate(-1))}
          aria-label="Go back"
        >
          <Icon name="back" size={20} />
        </button>
      )}
      {title !== undefined && (
        <h1>
          {title}
          {subtitle && <span className="sub">{subtitle}</span>}
        </h1>
      )}
      {right}
    </header>
  )
}

export function SectionHead({
  label,
  action,
  onAction,
  first,
}: {
  label: string
  action?: string
  onAction?: () => void
  first?: boolean
}) {
  return (
    <div className={`sechead${first ? ' first' : ''}`}>
      <span className="seclabel">{label}</span>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function Tile({
  category,
  icon,
  size = 'md',
  color,
}: {
  category?: Category
  icon?: IconName
  size?: 'sm' | 'md' | 'lg'
  color?: string
}) {
  const name: IconName = icon ?? (category as IconName) ?? 'document'
  const ink = color ?? (category ? catColor(category) : 'var(--primary-ink)')
  const bg = category
    ? catTint(category)
    : `color-mix(in srgb, ${ink} var(--tint), transparent)`
  const px = size === 'lg' ? 26 : size === 'sm' ? 17 : 20
  return (
    <span className={`tile${size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : ''}`} style={{ background: bg }}>
      <Icon name={name} size={px} color={ink} />
    </span>
  )
}

export function CatChip({ category }: { category: Category }) {
  return (
    <span className="catchip" style={{ background: catTint(category), color: catColor(category) }}>
      <Icon name={category as IconName} size={11} width={2} />
      {CATEGORIES[category].label}
    </span>
  )
}

/** Status is icon + word + colour — never colour alone. */
export function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { icon: IconName; tone: string }> = {
    unpaid: { icon: 'clock', tone: 'var(--warning)' },
    paid: { icon: 'check', tone: 'var(--success)' },
    active: { icon: 'check', tone: 'var(--success)' },
    confirmed: { icon: 'check', tone: 'var(--info)' },
    saved: { icon: 'check', tone: 'var(--muted)' },
    valid: { icon: 'shield', tone: 'var(--success)' },
    done: { icon: 'check', tone: 'var(--success)' },
    cancelled: { icon: 'close', tone: 'var(--danger)' },
  }
  const { icon, tone } = map[status]
  return (
    <span
      className="badge"
      style={{ background: `color-mix(in srgb, ${tone} var(--tint), transparent)`, color: tone }}
    >
      <Icon name={icon} size={11} width={2.4} />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ReviewBadge() {
  return (
    <span
      className="badge"
      style={{ background: 'color-mix(in srgb, var(--warning) var(--tint), transparent)', color: 'var(--warning)' }}
    >
      <Icon name="alert" size={11} width={2.4} />
      Needs review
    </span>
  )
}

// ---------------------------------------------------------------------------

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  )
}

export function Chip({
  label,
  on,
  count,
  onClick,
}: {
  label: string
  on?: boolean
  count?: number
  onClick?: () => void
}) {
  return (
    <button className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      {label}
      {count !== undefined && count > 0 && <span className="cnt">{count}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------

export function Field({
  label,
  children,
  error,
}: {
  label?: string
  children: ReactNode
  error?: string
}) {
  return (
    <label className="field">
      {label && <span className="lbl">{label}</span>}
      <span className={`box${error ? ' err' : ''}`}>{children}</span>
      {error && (
        <span className="errmsg">
          <Icon name="alert" size={12} width={2.2} />
          {error}
        </span>
      )}
    </label>
  )
}

export function Button({
  children,
  variant = 'primary',
  icon,
  onClick,
  disabled,
  type = 'button',
  small,
  style,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  icon?: IconName
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  small?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      type={type}
      className={`btn ${variant}${small ? ' sm' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {icon && <Icon name={icon} size={small ? 17 : 19} width={1.9} />}
      {children}
    </button>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}
