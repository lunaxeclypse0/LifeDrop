import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { NavBar } from './components/NavBar'
import { BottomSheet } from './components/Sheet'
import { Toast } from './components/Toast'
import { Icon } from './components/Icon'
import { Tile } from './components/UI'

import { Splash } from './screens/Splash'
import { Onboarding } from './screens/Onboarding'
import { Setup } from './screens/Setup'
import { Account } from './screens/Account'
import { SetPin } from './screens/SetPin'
import { LockScreen } from './screens/LockScreen'
import { Permissions } from './screens/Permissions'
import { Home } from './screens/Home'
import { Inbox } from './screens/Inbox'
import { CalendarScreen } from './screens/CalendarScreen'
import { Vault, VaultCategory } from './screens/Vault'
import { Search } from './screens/Search'
import { Voice } from './screens/Voice'
import { CameraCapture, UploadPicker } from './screens/Capture'
import { Processing } from './screens/Processing'
import { Review } from './screens/Review'
import { Saved } from './screens/Saved'
import { Detail } from './screens/Detail'
import { EditDrop } from './screens/EditDrop'
import { Spending } from './screens/Spending'
import { Subscriptions } from './screens/Subscriptions'
import { Notifications } from './screens/Notifications'
import { Profile } from './screens/Profile'
import { Appearance, Help, NotificationPrefs, Privacy } from './screens/Settings'

import { useApp } from './lib/store'
import type { IconName } from './lib/icons'

const TAB_ROUTES = ['/home', '/inbox', '/calendar', '/vault']

// ---------------------------------------------------------------------------

function useTheme() {
  const theme = useApp((s) => s.settings.theme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1C1C1D' : '#FFFFFF')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

/** Re-checks reminders whenever LifeDrop comes back to the foreground. */
function useReminderSweep() {
  const sweep = useApp((s) => s.sweepReminders)
  const ready = useApp((s) => s.ready)

  useEffect(() => {
    if (!ready) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sweep()
    }
    document.addEventListener('visibilitychange', onVisible)
    // A long-lived session still needs the date to roll over.
    const timer = setInterval(() => void sweep(), 15 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [ready, sweep])
}

/** Every route change starts at the top, per the motion spec. */
function useScrollReset() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.querySelector('.scrollhost')?.scrollTo({ top: 0 })
  }, [pathname])
}

// ---------------------------------------------------------------------------

const DROP_OPTIONS: { icon: IconName; title: string; body: string; kind: string }[] = [
  { icon: 'camera', title: 'Take a photo', body: 'Scan a paper bill, letter or warranty card', kind: 'camera' },
  { icon: 'image', title: 'Photo, screenshot or PDF', body: 'Pick anything already on this device', kind: 'upload' },
  { icon: 'mic', title: 'Say it', body: 'Speak the details, or ask me a question', kind: 'voice' },
  { icon: 'paste', title: 'Paste from clipboard', body: 'Whatever you just copied', kind: 'paste' },
  { icon: 'edit', title: 'Enter it myself', body: 'No file — just the details', kind: 'manual' },
]

function DropSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const setPending = useApp((s) => s.setPending)
  const showToast = useApp((s) => s.showToast)

  const pasteDrop = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) {
          const blob = await item.getType(type)
          const file = new File([blob], `pasted-${Date.now()}.png`, { type })
          setPending({ source: { file, kind: 'paste' }, previewUrl: URL.createObjectURL(file), extraction: null })
          onClose()
          navigate('/processing')
          return
        }
      }
      showToast('No image on the clipboard.')
    } catch {
      showToast('This browser will not let LifeDrop read the clipboard.')
    }
  }

  const pick = (kind: string) => {
    if (kind === 'paste') {
      void pasteDrop()
      return
    }
    onClose()
    if (kind === 'camera') navigate('/capture/camera')
    else if (kind === 'upload') navigate('/capture/upload')
    else if (kind === 'voice') navigate('/voice')
    else navigate('/review?manual=1')
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Drop something" subtitle="LifeDrop reads it and files it.">
      {DROP_OPTIONS.map((o, i) => (
        <button
          key={o.kind}
          className="sheetopt"
          style={{ '--d': `${i * 40}ms` } as React.CSSProperties}
          onClick={() => pick(o.kind)}
        >
          <Tile icon={o.icon} />
          <span className="mid">
            <span className="t">{o.title}</span>
            <span className="d">{o.body}</span>
          </span>
          <Icon name="chev" size={17} color="var(--muted)" />
        </button>
      ))}
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------

function Shell() {
  const [sheet, setSheet] = useState(false)
  const { pathname } = useLocation()
  const openDrop = useCallback(() => setSheet(true), [])

  useScrollReset()

  const showNav = TAB_ROUTES.some((r) => pathname === r)

  return (
    <>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/account" element={<Account />} />
        <Route path="/permissions" element={<Permissions />} />

        <Route path="/home" element={<Home onDrop={openDrop} />} />
        <Route path="/inbox" element={<Inbox onDrop={openDrop} />} />
        <Route path="/calendar" element={<CalendarScreen />} />
        <Route path="/vault" element={<Vault onDrop={openDrop} />} />
        <Route path="/vault/:category" element={<VaultCategory />} />

        <Route path="/search" element={<Search />} />
        <Route path="/voice" element={<Voice />} />
        <Route path="/spending" element={<Spending />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="/settings" element={<Navigate to="/profile" replace />} />
        <Route path="/settings/notifications" element={<NotificationPrefs />} />
        <Route path="/settings/privacy" element={<Privacy />} />
        <Route path="/settings/appearance" element={<Appearance />} />
        <Route path="/settings/help" element={<Help />} />
        <Route path="/settings/pin" element={<SetPin />} />

        <Route path="/capture/camera" element={<CameraCapture />} />
        <Route path="/capture/upload" element={<UploadPicker />} />
        <Route path="/processing" element={<Processing />} />
        <Route path="/review" element={<Review />} />
        <Route path="/saved/:id" element={<Saved />} />
        <Route path="/item/:id" element={<Detail />} />
        <Route path="/item/:id/edit" element={<EditDrop />} />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>

      {showNav && <NavBar onDrop={openDrop} />}
      <DropSheet open={sheet} onClose={() => setSheet(false)} />
      <Toast />
    </>
  )
}

export default function App() {
  const init = useApp((s) => s.init)
  const ready = useApp((s) => s.ready)
  const locked = useApp((s) => s.settings.lock.enabled)
  const unlocked = useApp((s) => s.unlocked)
  const setUnlocked = useApp((s) => s.setUnlocked)

  useTheme()
  useReminderSweep()

  useEffect(() => {
    void init()
  }, [init])

  // Re-lock the moment the app leaves the foreground.
  useEffect(() => {
    if (!locked) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') setUnlocked(false)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [locked, setUnlocked])

  return (
    <div className="shell">
      <div className="device">
        {ready && locked && !unlocked ? (
          <LockScreen />
        ) : (
          <HashRouter>
            <Shell />
          </HashRouter>
        )}
      </div>
    </div>
  )
}
