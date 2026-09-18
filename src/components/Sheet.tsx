import { useEffect, type ReactNode } from 'react'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
}) {
  useEscape(onClose)
  if (!open) return null
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet nsb" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {subtitle && (
          <p className="body2" style={{ margin: '0 0 14px' }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEscape(onClose)
  if (!open) return null
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2 style={{ margin: '0 0 8px', fontFamily: 'Manrope, sans-serif', fontSize: 19, letterSpacing: '-.5px' }}>
          {title}
        </h2>
        {children}
      </div>
    </>
  )
}
