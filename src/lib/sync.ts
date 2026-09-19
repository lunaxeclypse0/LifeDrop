import type { Drop } from './types'
import * as db from './db'
import { cloudConfigured, fromRow, supabase, toRow, type DropRow } from './supabase'

/**
 * Sync between the local store and Supabase.
 *
 * The device stays the fast path: every screen reads IndexedDB, so the app
 * works offline and opens instantly. Writes go to IndexedDB first and into an
 * outbox, which is flushed to the server on the next opportunity. Nothing the
 * user does is ever blocked on the network.
 *
 * Conflicts are resolved last-write-wins on `updatedAt`. That is honest for
 * this shape of data — one person, a handful of devices, edits that are rarely
 * simultaneous — and it never silently drops the newer of two edits.
 */

const LAST_PULL_KEY = 'lifedrop.lastPull'

function lastPull(): string {
  try {
    return localStorage.getItem(LAST_PULL_KEY) || '1970-01-01T00:00:00Z'
  } catch {
    return '1970-01-01T00:00:00Z'
  }
}

function setLastPull(iso: string) {
  try {
    localStorage.setItem(LAST_PULL_KEY, iso)
  } catch {
    /* a full pull next time is the safe failure */
  }
}

export function resetSyncCursor(): void {
  try {
    localStorage.removeItem(LAST_PULL_KEY)
  } catch {
    /* nothing to clear */
  }
}

export interface SyncResult {
  pushed: number
  pulled: number
  deleted: number
  error?: string
}

/** Uploads the original image and returns its storage path. */
async function uploadImage(userId: string, drop: Drop): Promise<string | null> {
  if (!drop.imageId || drop.imagePath) return drop.imagePath ?? null
  const blob = await db.getBlob(drop.imageId)
  if (!blob) return null

  const ext = (drop.fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpg').toLowerCase()
  const path = `${userId}/${drop.id}.${ext}`
  const { error } = await supabase()
    .storage.from('drops')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })

  // A failed image must not block the drop's own row from syncing.
  return error ? null : path
}

/** Fetches an original from storage into the local blob cache. */
export async function cacheImage(drop: Drop): Promise<string | null> {
  if (!drop.imagePath || !cloudConfigured()) return null
  const localId = `img-${drop.id}`
  if (await db.getBlob(localId)) return localId

  const { data, error } = await supabase().storage.from('drops').download(drop.imagePath)
  if (error || !data) return null
  await db.putBlob(localId, data)
  return localId
}

/**
 * Flushes pending local writes, then pulls anything the server has that is
 * newer. Safe to call often; it does nothing when there is nothing to do.
 */
export async function sync(userId: string): Promise<SyncResult> {
  const out: SyncResult = { pushed: 0, pulled: 0, deleted: 0 }
  if (!cloudConfigured()) return out

  const sb = supabase()

  // --- push -----------------------------------------------------------------
  const pending = await db.pendingChanges()
  for (const change of pending) {
    try {
      if (change.op === 'delete') {
        // Soft delete, so other devices learn about it on their next pull.
        const { error } = await sb
          .from('drops')
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', change.id)
          .eq('user_id', userId)
        if (error) throw error
        out.deleted++
      } else {
        const local = (await db.allDrops()).find((d) => d.id === change.id)
        if (!local) {
          await db.clearChange(change.id)
          continue
        }
        const imagePath = await uploadImage(userId, local)
        if (imagePath && imagePath !== local.imagePath) {
          await db.putDrop({ ...local, imagePath })
          local.imagePath = imagePath
        }
        const { error } = await sb.from('drops').upsert(toRow(local, userId), { onConflict: 'id' })
        if (error) throw error
        out.pushed++
      }
      await db.clearChange(change.id)
    } catch (e) {
      // Leave it queued and stop — the next sync retries in order.
      out.error = e instanceof Error ? e.message : 'Could not reach the server.'
      return out
    }
  }

  // --- pull -----------------------------------------------------------------
  try {
    const since = lastPull()
    const { data, error } = await sb
      .from('drops')
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })

    if (error) throw error

    const rows = (data ?? []) as DropRow[]
    const local = new Map((await db.allDrops()).map((d) => [d.id, d]))
    const writes: Drop[] = []

    for (const row of rows) {
      if (row.deleted_at) {
        if (local.has(row.id)) {
          await db.deleteDrop(row.id)
          out.deleted++
        }
        continue
      }
      const incoming = fromRow(row)
      const mine = local.get(row.id)
      // Only take the server's copy when it is genuinely newer than ours.
      if (!mine || incoming.updatedAt > mine.updatedAt) {
        writes.push(mine?.imageId ? { ...incoming, imageId: mine.imageId } : incoming)
        out.pulled++
      }
    }

    if (writes.length) await db.putDrops(writes)
    if (rows.length) setLastPull(rows[rows.length - 1].updated_at)
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'Could not reach the server.'
  }

  return out
}

/**
 * Sends everything on this device up under the signed-in user. Used once,
 * right after a first sign-in, so drops made before signing up are not lost.
 */
export async function adoptLocalDrops(): Promise<number> {
  const local = (await db.allDrops()).filter((d) => !d.sample)
  for (const d of local) await db.queueChange(d.id, 'put')
  return local.length
}
