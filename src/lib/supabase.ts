import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { Drop } from './types'

/**
 * Supabase client and row mapping.
 *
 * `VITE_SUPABASE_ANON_KEY` is public by design — it ships in the bundle. What
 * keeps one person's vault away from everyone else is the row-level security
 * in supabase/schema.sql, not the key. If that file has not been run, the app
 * is not safe to share, so `cloudConfigured()` is checked before sign-in is
 * offered at all.
 */

// `import.meta.env` only exists under Vite; the Node test runner imports this
// module too, so read it defensively rather than crashing on load.
const env = (import.meta.env ?? {}) as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export function cloudConfigured(): boolean {
  return Boolean(url && anon)
}

export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anon) throw new Error('Supabase is not configured.')
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}

export async function currentUser(): Promise<User | null> {
  if (!cloudConfigured()) return null
  const { data } = await supabase().auth.getUser()
  return data.user ?? null
}

// ---------------------------------------------------------------------------
// row <-> Drop
// ---------------------------------------------------------------------------

export interface DropRow {
  id: string
  user_id: string
  title: string
  merchant: string
  amount: number | null
  category: string
  date: string
  time: string | null
  status: string
  repeat: string
  remind_days_before: number | null
  reference: string
  notes: string
  file_name: string
  image_path: string | null
  needs_review: boolean
  archived: boolean
  history: Drop['history']
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function toRow(drop: Drop, userId: string): Omit<DropRow, 'deleted_at'> {
  return {
    id: drop.id,
    user_id: userId,
    title: drop.title,
    merchant: drop.merchant,
    amount: drop.amount,
    category: drop.category,
    date: drop.date,
    time: drop.time,
    status: drop.status,
    repeat: drop.repeat,
    remind_days_before: drop.remindDaysBefore,
    reference: drop.reference,
    notes: drop.notes,
    file_name: drop.fileName,
    image_path: drop.imagePath ?? null,
    needs_review: drop.needsReview,
    archived: drop.archived,
    history: drop.history,
    created_at: new Date(drop.createdAt).toISOString(),
    updated_at: new Date(drop.updatedAt).toISOString(),
  }
}

export function fromRow(row: DropRow): Drop {
  return {
    id: row.id,
    title: row.title,
    merchant: row.merchant,
    amount: row.amount === null ? null : Number(row.amount),
    category: row.category as Drop['category'],
    date: row.date,
    time: row.time,
    status: row.status as Drop['status'],
    repeat: row.repeat as Drop['repeat'],
    remindDaysBefore: row.remind_days_before,
    reference: row.reference,
    notes: row.notes,
    fileName: row.file_name,
    // The blob itself is fetched lazily and cached locally by image path.
    imageId: null,
    imagePath: row.image_path,
    needsReview: row.needs_review,
    archived: row.archived,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    history: Array.isArray(row.history) ? row.history : [],
  }
}
