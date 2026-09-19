import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { warmVoices } from './lib/speech'
import './styles/global.css'

/**
 * Keeping an installed app current.
 *
 * Once LifeDrop is on a home screen there is no address bar to reload from, so
 * a stale service worker would serve an old build indefinitely. This asks for
 * a fresh one every time the app is opened or brought back to the foreground,
 * and reloads once the new one is ready.
 *
 * The reload is safe: everything the user owns lives in IndexedDB, which the
 * service worker never touches.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // No prompt. An organiser that quietly stays current is better than one
    // that asks permission to fix itself.
    void updateSW(true)
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return

    const check = () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    // A phone left open for days should still pick up a new build.
    setInterval(check, 60 * 60 * 1000)
  },
})

// Chrome loads the voice list asynchronously, so the first spoken reply would
// otherwise be stuck with the default voice.
warmVoices()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
