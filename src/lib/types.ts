import type { LockConfig } from './lock'

export type Category =
  | 'bill'
  | 'receipt'
  | 'booking'
  | 'subscription'
  | 'warranty'
  | 'document'
  | 'event'

export type Repeat = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly'

export type Status =
  | 'unpaid'
  | 'paid'
  | 'active'
  | 'confirmed'
  | 'saved'
  | 'valid'
  | 'done'
  | 'cancelled'

/** An item that has been dropped, extracted and filed. */
export interface Drop {
  id: string
  title: string
  merchant: string
  /** PHP. null for things that carry no amount (bookings, documents). */
  amount: number | null
  category: Category
  /** ISO yyyy-mm-dd — the due date, event date, renewal date or expiry. */
  date: string
  /** "HH:mm" when the item happens at a time of day, else null. */
  time: string | null
  status: Status
  repeat: Repeat
  /** Days before `date` to fire the reminder. null = no reminder. */
  remindDaysBefore: number | null
  reference: string
  notes: string
  /** Original file name of the drop. */
  fileName: string
  /** Key into the local `blobs` store — the original, cached on this device. */
  imageId: string | null
  /** Path in the `drops` storage bucket, when the original has been synced. */
  imagePath?: string | null
  /** Set when the AI was unsure about a field. */
  needsReview: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
  history: HistoryEntry[]
  /** True for the opt-in demo vault, so it can be removed without touching real drops. */
  sample?: boolean
}

export interface HistoryEntry {
  label: string
  at: number
  /** CSS colour token name for the timeline dot. */
  tone: 'primary' | 'accent' | 'success' | 'border'
}

/** What the extractor returns before the user reviews it. */
export interface Extraction {
  title: string
  merchant: string
  amount: number | null
  category: Category
  date: string
  time: string | null
  repeat: Repeat
  remindDaysBefore: number | null
  reference: string
  notes: string
  /** 0–1. Below `REVIEW_THRESHOLD` the drop is flagged "Needs review". */
  confidence: number
  /** Fields the extractor could not read with confidence. */
  uncertain: string[]
}

export interface DropSource {
  /** The captured or picked file. */
  file: File
  /** How it arrived, for the history trail. */
  kind: 'camera' | 'upload' | 'paste' | 'manual'
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  onboarded: boolean
  name: string
  email: string
  prefs: {
    bills: boolean
    events: boolean
    renew: boolean
    review: boolean
    quiet: boolean
    hideOnLock: boolean
    /** Let the assistant read the vault so it can answer open questions. */
    assistantReadsDrops: boolean
  }
  /** PIN + optional biometric gate. See lib/lock.ts for what it does and does not protect. */
  lock: LockConfig
}

export const CATEGORIES: Record<Category, { label: string; plural: string; varName: string }> = {
  bill: { label: 'Bill', plural: 'Bills', varName: '--cat-bill' },
  receipt: { label: 'Receipt', plural: 'Receipts', varName: '--cat-receipt' },
  booking: { label: 'Booking', plural: 'Bookings', varName: '--cat-booking' },
  subscription: { label: 'Subscription', plural: 'Subscriptions', varName: '--cat-subscription' },
  warranty: { label: 'Warranty', plural: 'Warranties', varName: '--cat-warranty' },
  document: { label: 'Document', plural: 'Documents', varName: '--cat-document' },
  event: { label: 'Event', plural: 'Events', varName: '--cat-event' },
}

export const CATEGORY_ORDER: Category[] = [
  'bill',
  'receipt',
  'booking',
  'subscription',
  'warranty',
  'document',
  'event',
]

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Does not repeat',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  semiannual: 'Every 6 months',
  yearly: 'Yearly',
}

export const STATUS_LABEL: Record<Status, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  active: 'Active',
  confirmed: 'Confirmed',
  saved: 'Saved',
  valid: 'Valid',
  done: 'Done',
  cancelled: 'Cancelled',
}

/** Status a freshly saved drop gets, per category. */
export const DEFAULT_STATUS: Record<Category, Status> = {
  bill: 'unpaid',
  receipt: 'saved',
  booking: 'confirmed',
  subscription: 'active',
  warranty: 'active',
  document: 'valid',
  event: 'confirmed',
}

/** Categories where "done" means paid. */
export function isPayable(c: Category): boolean {
  return c === 'bill' || c === 'subscription'
}
