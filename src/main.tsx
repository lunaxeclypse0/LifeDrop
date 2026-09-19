import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { warmVoices } from './lib/speech'
import './styles/global.css'

registerSW({ immediate: true })

// Chrome loads the voice list asynchronously, so the first spoken reply would
// otherwise be stuck with the default voice.
warmVoices()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
