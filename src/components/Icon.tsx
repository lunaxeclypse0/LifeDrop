import { ICON_PATHS, type IconName } from '../lib/icons'

interface Props {
  name: IconName
  size?: number
  color?: string
  width?: number
  className?: string
}

export function Icon({ name, size = 20, color = 'currentColor', width = 1.7, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {ICON_PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
