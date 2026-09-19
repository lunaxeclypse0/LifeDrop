import { create } from 'zustand'
import type { AppSettings, Drop, DropSource, Extraction, Status } from './types'
import { DEFAULT_STATUS } from './types'
import * as db from './db'
import { buildSeedDrops } from './seed'
import { nextOccurrence, toISO, todayISO } from './format'
import { defaultLeadDays, rearm, runReminderSweep } from './reminders'
import { clearFailures, createLock, NO_LOCK } from './lock'
import { cloudConfigured, currentUser, supabase } from './supabase'
import { adoptLocalDrops, resetSyncCursor, sync } from './sync'
import type { User } from '@supabase/supabase-js'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  onboarded: false,
  // Blank until the user says who they are. Nothing is invented for them.
  name: '',
  email: '',
  prefs: { bills: true, events: true, renew: true, review: false, quiet: true, hideOnLock: false },
  lock: NO_LOCK,
}

export interface ToastState {
  message: string
  /** Shown as an action button; usually an undo. */
  action?: { label: string; run: () => void }
}

/** Carries a capture from Camera/Upload through Processing into Review. */
export interface PendingDrop {
  source: DropSource
  /** Object URL for the preview; revoked when the pending drop is cleared. */
  previewUrl: string | null
  extraction: Extraction | null
}

interface State {
  ready: boolean
  drops: Drop[]
  settings: AppSettings
  toast: ToastState | null
  pending: PendingDrop | null
  online: boolean

  init: () => Promise<void>
  setToast: (t: ToastState | null) => void
  showToast: (message: string, action?: ToastState['action']) => void

  setPending: (p: PendingDrop | null) => void
  setExtraction: (e: Extraction) => void

  saveDrop: (drop: Drop) => Promise<void>
  commitPending: (draft: Extraction) => Promise<Drop>
  updateDrop: (id: string, patch: Partial<Drop>, historyLabel?: string) => Promise<void>
  removeDrop: (id: string) => Promise<void>
  setArchived: (id: string, archived: boolean) => Promise<void>
  markDone: (id: string) => Promise<void>

  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
  setPref: (key: keyof AppSettings['prefs'], value: boolean) => Promise<void>
  /** Opt-in demo vault, so the app can be explored before the first real drop. */
  loadSamples: () => Promise<void>
  clearSamples: () => Promise<void>
  resetEverything: () => Promise<void>
  sweepReminders: () => Promise<void>

  // --- account ---
  user: User | null
  syncing: boolean
  syncError: string | null
  signUp: (email: string, password: string, name: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>

  /** Whether the lock has been satisfied for this foreground session. */
  unlocked: boolean
  setUnlocked: (v: boolean) => void
  setPin: (pin: string) => Promise<void>
  disableLock: () => Promise<void>
  setBiometricId: (id: string | null) => Promise<void>
}

function uid(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function stamp(drop: Drop, label: string, tone: Drop['history'][number]['tone'] = 'primary'): Drop {
  return {
    ...drop,
    updatedAt: Date.now(),
    history: [{ label, at: Date.now(), tone }, ...drop.history],
  }
}

export const useApp = create<State>((set, get) => ({
  ready: false,
  drops: [],
  settings: DEFAULT_SETTINGS,
  toast: null,
  pending: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,

  async init() {
    // A new install starts empty. The demo vault is opt-in, never planted.
    const [stored, drops] = await Promise.all([db.loadSettings(), db.allDrops()])

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      prefs: { ...DEFAULT_SETTINGS.prefs, ...stored?.prefs },
      // Older installs stored `appLock`/`biometrics` booleans; those carried no
      // secret, so they fall back to no lock rather than migrating.
      lock: { ...NO_LOCK, ...stored?.lock },
    }

    set({ drops, settings, ready: true, unlocked: !settings.lock.enabled })

    if (typeof window !== 'undefined') {
      const sync = () => set({ online: navigator.onLine })
      window.addEventListener('online', sync)
      window.addEventListener('offline', sync)
    }

    void get().sweepReminders()

    if (cloudConfigured()) {
      const user = await currentUser()
      if (user) {
        set({ user })
        await get().syncNow()
        set({ drops: await db.allDrops() })
      }
      // A token can expire or be revoked while the app is open.
      supabase().auth.onAuthStateChange((_event, session) => {
        set({ user: session?.user ?? null })
      })
    }
  },

  setToast(toast) {
    set({ toast })
  },

  showToast(message, action) {
    set({ toast: { message, action } })
  },

  setPending(pending) {
    const prev = get().pending
    if (prev?.previewUrl && prev.previewUrl !== pending?.previewUrl) {
      URL.revokeObjectURL(prev.previewUrl)
    }
    set({ pending })
  },

  setExtraction(extraction) {
    const pending = get().pending
    if (pending) set({ pending: { ...pending, extraction } })
  },

  async saveDrop(drop) {
    await db.putDrop(drop)
    await db.queueChange(drop.id, 'put')
    set({ drops: [...get().drops.filter((d) => d.id !== drop.id), drop] })
    void get().syncNow()
  },

  async commitPending(draft) {
    const pending = get().pending
    const now = Date.now()
    const id = uid()

    let imageId: string | null = null
    if (pending?.source.file) {
      imageId = `img-${id}`
      await db.putBlob(imageId, pending.source.file)
    }

    const kindLabel =
      pending?.source.kind === 'camera' ? 'Captured with the camera'
      : pending?.source.kind === 'upload' ? 'Dropped from a file'
      : pending?.source.kind === 'paste' ? 'Dropped from the clipboard'
      : 'Added by hand'

    const drop: Drop = {
      id,
      title: draft.title,
      merchant: draft.merchant,
      amount: draft.amount,
      category: draft.category,
      date: draft.date,
      time: draft.time,
      status: DEFAULT_STATUS[draft.category],
      repeat: draft.repeat,
      // Nobody should have to think about lead times — pick a sensible one
      // for the kind of thing this is, and let them change it after.
      remindDaysBefore: draft.remindDaysBefore ?? defaultLeadDays(draft.category),
      reference: draft.reference,
      notes: draft.notes,
      fileName: pending?.source.file.name || 'manual-entry',
      imageId,
      needsReview: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      history: [
        { label: 'Saved to Inbox and Vault', at: now + 2, tone: 'border' },
        { label: 'Details extracted by LifeDrop AI', at: now + 1, tone: 'accent' },
        { label: kindLabel, at: now, tone: 'primary' },
      ],
    }

    await db.putDrop(drop)
    await db.queueChange(drop.id, 'put')
    get().setPending(null)
    set({ drops: [...get().drops, drop] })
    void get().syncNow()
    return drop
  },

  async updateDrop(id, patch, historyLabel) {
    const current = get().drops.find((d) => d.id === id)
    if (!current) return
    let next: Drop = { ...current, ...patch, updatedAt: Date.now() }
    if (historyLabel) next = stamp(next, historyLabel)
    if (patch.date && patch.date !== current.date) rearm(id)
    await db.putDrop(next)
    await db.queueChange(id, 'put')
    set({ drops: get().drops.map((d) => (d.id === id ? next : d)) })
    void get().syncNow()
  },

  async removeDrop(id) {
    const wasSample = get().drops.find((d) => d.id === id)?.sample
    await db.deleteDrop(id)
    // Demo rows never went up, so there is nothing to tell the server about.
    if (!wasSample) await db.queueChange(id, 'delete')
    set({ drops: get().drops.filter((d) => d.id !== id) })
    if (!wasSample) void get().syncNow()
  },

  async setArchived(id, archived) {
    await get().updateDrop(id, { archived }, archived ? 'Archived' : 'Restored to Inbox')
  },

  async markDone(id) {
    const drop = get().drops.find((d) => d.id === id)
    if (!drop) return

    const doneStatus: Status = drop.category === 'bill' || drop.category === 'subscription' ? 'paid' : 'done'

    // A repeating drop rolls forward instead of ending — the next bill is
    // the same commitment, so the user should not have to re-drop it.
    if (drop.repeat !== 'none') {
      const advanced = nextOccurrence(drop.date, drop.repeat)
      rearm(id)
      await get().updateDrop(
        id,
        { status: DEFAULT_STATUS[drop.category], date: advanced },
        drop.category === 'bill' ? 'Marked paid · rolled to next month' : 'Marked done · rolled forward',
      )
      return
    }

    await get().updateDrop(id, { status: doneStatus }, doneStatus === 'paid' ? 'Marked paid by you' : 'Marked done by you')
  },

  async patchSettings(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    await db.saveSettings(settings)
  },

  async setPref(key, value) {
    const settings = { ...get().settings, prefs: { ...get().settings.prefs, [key]: value } }
    set({ settings })
    await db.saveSettings(settings)
  },

  async loadSamples() {
    const samples = buildSeedDrops()
    await db.putDrops(samples)
    const own = get().drops.filter((d) => !d.sample)
    set({ drops: [...own, ...samples] })
  },

  async clearSamples() {
    const samples = get().drops.filter((d) => d.sample)
    await Promise.all(samples.map((d) => db.deleteDrop(d.id)))
    set({ drops: get().drops.filter((d) => !d.sample) })
  },

  async resetEverything() {
    await db.wipeAll()
    try {
      localStorage.removeItem('lifedrop.remindersFired')
    } catch {
      /* nothing to clear */
    }
    set({ drops: [], settings: DEFAULT_SETTINGS })
  },

  async sweepReminders() {
    const { drops, settings } = get()
    await runReminderSweep(drops, settings)
  },

  user: null,
  syncing: false,
  syncError: null,

  async signUp(email, password, name) {
    if (!cloudConfigured()) return 'Cloud accounts are not set up for this build.'
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    })
    if (error) return error.message
    if (!data.user) return 'Check your email to confirm the account, then sign in.'

    // Anything dropped before signing up belongs to this account now.
    await adoptLocalDrops()
    set({ user: data.user })
    await get().patchSettings({ name: name.trim(), email: email.trim(), onboarded: true })
    void get().syncNow()
    return null
  },

  async signIn(email, password) {
    if (!cloudConfigured()) return 'Cloud accounts are not set up for this build.'
    const { data, error } = await supabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return error.message

    // A different person on this device must not inherit the last one's vault.
    const previous = get().settings.email
    if (previous && previous !== email.trim()) {
      await db.wipeAll()
      resetSyncCursor()
      set({ drops: [] })
    }

    set({ user: data.user })
    await get().patchSettings({ email: email.trim(), onboarded: true })
    await get().syncNow()
    set({ drops: await db.allDrops() })
    return null
  },

  async signOut() {
    if (cloudConfigured()) await supabase().auth.signOut().catch(() => {})
    // The vault is the account's, not the device's — leaving it behind for the
    // next person to open would be a leak.
    await db.wipeAll()
    resetSyncCursor()
    clearFailures()
    set({ user: null, drops: [], settings: DEFAULT_SETTINGS, unlocked: true })
  },

  async syncNow() {
    const user = get().user
    if (!user || !cloudConfigured() || get().syncing) return
    set({ syncing: true })
    const result = await sync(user.id)
    set({
      syncing: false,
      syncError: result.error ?? null,
      drops: result.pulled || result.deleted ? await db.allDrops() : get().drops,
    })
  },

  unlocked: false,

  setUnlocked(unlocked) {
    if (unlocked) clearFailures()
    set({ unlocked })
  },

  async setPin(pin) {
    // Keep any enrolled biometric — changing the PIN should not force the
    // user to re-enrol Face ID.
    const lock = await createLock(pin, get().settings.lock.biometricId)
    clearFailures()
    await get().patchSettings({ lock })
    set({ unlocked: true })
  },

  async disableLock() {
    clearFailures()
    await get().patchSettings({ lock: NO_LOCK })
    set({ unlocked: true })
  },

  async setBiometricId(biometricId) {
    await get().patchSettings({ lock: { ...get().settings.lock, biometricId } })
  },
}))

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------

export const liveDrops = (drops: Drop[]) => drops.filter((d) => !d.archived)

export function byDate(a: Drop, b: Drop) {
  return a.date.localeCompare(b.date)
}

export function byNewest(a: Drop, b: Drop) {
  return b.createdAt - a.createdAt
}

export function byAmount(a: Drop, b: Drop) {
  return (b.amount ?? -1) - (a.amount ?? -1)
}

/**
 * What needs the user today: anything dated today, plus bills and renewals
 * that have slipped past. A past appointment is over, not outstanding, so it
 * does not linger here.
 */
export function todayDrops(drops: Drop[]): Drop[] {
  const today = todayISO()
  return liveDrops(drops)
    .filter((d) => d.status !== 'paid' && d.status !== 'done' && d.status !== 'cancelled')
    .filter((d) => d.category !== 'receipt')
    .filter((d) => {
      if (d.date === today) return true
      const overdueKind = d.category === 'bill' || d.category === 'subscription'
      return d.date < today && overdueKind
    })
    .sort(byDate)
}

export function upcomingDrops(drops: Drop[], withinDays = 30): Drop[] {
  const today = todayISO()
  const limit = new Date()
  limit.setDate(limit.getDate() + withinDays)
  // toISO(), not toISOString() — the latter is UTC and reports yesterday
  // through the whole Philippine morning.
  const limitISO = toISO(limit)
  return liveDrops(drops)
    .filter((d) => d.date > today && d.date <= limitISO && d.status !== 'paid' && d.status !== 'done')
    .sort(byDate)
}

export function recentDrops(drops: Drop[], n = 6): Drop[] {
  return liveDrops(drops).sort(byNewest).slice(0, n)
}

export function needsReviewDrops(drops: Drop[]): Drop[] {
  return liveDrops(drops).filter((d) => d.needsReview)
}

/** Money out this calendar month, from receipts and bills that are settled. */
export function monthSpend(drops: Drop[], year: number, month: number): number {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return drops
    .filter((d) => !d.archived && d.date.startsWith(prefix) && d.amount)
    .filter((d) => d.category === 'receipt' || (d.category === 'bill' && d.status === 'paid'))
    .reduce((sum, d) => sum + (d.amount ?? 0), 0)
}

/**
 * Money committed for the month but not yet settled — unpaid bills and
 * renewals that fall in it. Home shows this rather than `monthSpend`, because
 * a freshly scanned bill is exactly what the user wants to see a number for,
 * and it is unpaid by definition.
 */
export function monthDue(drops: Drop[], year: number, month: number): number {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return liveDrops(drops)
    .filter((d) => d.date.startsWith(prefix) && d.amount)
    .filter((d) => d.status === 'unpaid' || (d.category === 'subscription' && d.status === 'active'))
    .reduce((sum, d) => sum + (d.amount ?? 0), 0)
}

/** Everything still owed, whatever month it falls in. */
export function outstandingTotal(drops: Drop[]): number {
  return liveDrops(drops)
    .filter((d) => d.amount)
    .filter((d) => d.status === 'unpaid' || (d.category === 'subscription' && d.status === 'active'))
    .reduce((sum, d) => sum + (d.amount ?? 0), 0)
}

export function monthlySubscriptionTotal(drops: Drop[]): number {
  return liveDrops(drops)
    .filter((d) => d.category === 'subscription' && d.status === 'active')
    .reduce((sum, d) => sum + (d.amount ?? 0), 0)
}

export function searchDrops(drops: Drop[], query: string): Drop[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/)
  return liveDrops(drops)
    .filter((d) => {
      const hay = `${d.title} ${d.merchant} ${d.reference} ${d.notes} ${d.category} ${d.fileName}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
    .sort(byNewest)
}
