import { useEffect } from 'react'
import { useApp } from '../lib/store'

export function Toast() {
  const toast = useApp((s) => s.toast)
  const setToast = useApp((s) => s.setToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast, setToast])

  if (!toast) return null

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="mid">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.run()
            setToast(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
