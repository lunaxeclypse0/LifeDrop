import { Icon } from './Icon'
import { useApp } from '../lib/store'

/** True when `system` currently resolves to dark. */
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolvedDark(theme: 'light' | 'dark' | 'system'): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark())
}

/**
 * One-tap light/dark switch for the top bar. Tapping always lands on an
 * explicit theme — leaving `system` on the first tap would look like nothing
 * happened whenever the OS already matched.
 */
export function ThemeToggle() {
  const theme = useApp((s) => s.settings.theme)
  const patchSettings = useApp((s) => s.patchSettings)
  const dark = resolvedDark(theme)

  return (
    <button
      className="iconbtn"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      onClick={() => void patchSettings({ theme: dark ? 'light' : 'dark' })}
    >
      {/* No wrapper span: an inline element puts the SVG on the text baseline,
          which lifted the icon a couple of pixels above centre. */}
      <Icon name={dark ? 'sun' : 'moon'} size={20} />
    </button>
  )
}
