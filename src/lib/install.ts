import { useEffect, useState } from 'react'

/**
 * PWA install, which every platform does differently.
 *
 * Chrome, Edge and Android fire `beforeinstallprompt`, which can be stashed
 * and replayed from a real click — that gives a true one-tap install.
 * iOS Safari fires nothing and exposes no API, so there the only honest
 * answer is to show the Share -> Add to Home Screen steps.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'lifedrop.installDismissed'

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which is not in the standard typings
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports as a Mac, so the touch check catches it too.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export type InstallState =
  | 'installed' // already running from the home screen
  | 'ready' // the browser gave us a prompt to replay
  | 'manual' // installable, but the user has to do it by hand (iOS)
  | 'unavailable' // desktop browser with no install path, or unsupported

declare global {
  interface Window {
    __ldInstallPrompt: BeforeInstallPromptEvent | null
  }
}

export function useInstall() {
  // The inline script in index.html catches the event before React exists,
  // so start from whatever it already stashed.
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => (typeof window === 'undefined' ? null : (window.__ldInstallPrompt ?? null)),
  )
  const [installed, setInstalled] = useState(isStandalone)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    // Fires when the inline catcher stashes one after this component mounted.
    const onReady = () => setDeferred(window.__ldInstallPrompt ?? null)
    const onPrompt = (e: Event) => {
      e.preventDefault() // stop the browser's own mini-infobar
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
      window.__ldInstallPrompt = null
    }
    window.addEventListener('ld-install-ready', onReady)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('ld-install-ready', onReady)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const state: InstallState = installed
    ? 'installed'
    : deferred
      ? 'ready'
      : isIOS()
        ? 'manual'
        : 'unavailable'

  /** Returns true when the app was actually installed. */
  const install = async (): Promise<boolean> => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // A captured prompt can only be replayed once; drop it from both places.
    setDeferred(null)
    window.__ldInstallPrompt = null
    return outcome === 'accepted'
  }

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      /* the banner just comes back next session */
    }
  }

  return { state, install, dismiss, dismissed }
}
