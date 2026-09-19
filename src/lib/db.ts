import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AppSettings, Drop } from './types'

interface LifeDropDB extends DBSchema {
  drops: {
    key: string
    value: Drop
    indexes: { 'by-date': string; 'by-category': string; 'by-created': number }
  }
  /** Original screenshots and photos, kept beside the drop that owns them. */
  blobs: {
    key: string
    value: { id: string; blob: Blob; type: string }
  }
  settings: {
    key: string
    value: unknown
  }
  /** Local changes not yet accepted by the server. */
  outbox: {
    key: string
    value: { id: string; op: 'put' | 'delete'; at: number }
  }
}

let dbp: Promise<IDBPDatabase<LifeDropDB>> | null = null

function db() {
  if (!dbp) {
    dbp = openDB<LifeDropDB>('lifedrop', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const drops = d.createObjectStore('drops', { keyPath: 'id' })
          drops.createIndex('by-date', 'date')
          drops.createIndex('by-category', 'category')
          drops.createIndex('by-created', 'createdAt')
          d.createObjectStore('blobs', { keyPath: 'id' })
          d.createObjectStore('settings')
        }
        if (oldVersion < 2) {
          d.createObjectStore('outbox', { keyPath: 'id' })
        }
      },
    })
  }
  return dbp
}

export async function allDrops(): Promise<Drop[]> {
  return (await db()).getAll('drops')
}

export async function putDrop(drop: Drop): Promise<void> {
  await (await db()).put('drops', drop)
}

export async function putDrops(drops: Drop[]): Promise<void> {
  const d = await db()
  const tx = d.transaction('drops', 'readwrite')
  await Promise.all([...drops.map((x) => tx.store.put(x)), tx.done])
}

export async function deleteDrop(id: string): Promise<void> {
  const d = await db()
  const drop = await d.get('drops', id)
  await d.delete('drops', id)
  if (drop?.imageId) await d.delete('blobs', drop.imageId).catch(() => {})
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await (await db()).put('blobs', { id, blob, type: blob.type })
}

export async function getBlob(id: string): Promise<Blob | null> {
  const rec = await (await db()).get('blobs', id)
  return rec?.blob ?? null
}

// --- outbox -----------------------------------------------------------------

export async function queueChange(id: string, op: 'put' | 'delete'): Promise<void> {
  await (await db()).put('outbox', { id, op, at: Date.now() })
}

export async function pendingChanges(): Promise<{ id: string; op: 'put' | 'delete'; at: number }[]> {
  return (await db()).getAll('outbox')
}

export async function clearChange(id: string): Promise<void> {
  await (await db()).delete('outbox', id)
}

export async function clearOutbox(): Promise<void> {
  await (await db()).clear('outbox')
}

export async function loadSettings(): Promise<Partial<AppSettings> | null> {
  return ((await (await db()).get('settings', 'app')) as Partial<AppSettings>) ?? null
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await (await db()).put('settings', s, 'app')
}

/** Everything the user owns, as a plain object — backs Settings > Data export. */
export async function exportAll(): Promise<{ exportedAt: string; drops: Drop[]; settings: unknown }> {
  const d = await db()
  return {
    exportedAt: new Date().toISOString(),
    drops: await d.getAll('drops'),
    settings: await d.get('settings', 'app'),
  }
}

/** Settings > Delete account. Removes every drop, image and preference. */
export async function wipeAll(): Promise<void> {
  const d = await db()
  await Promise.all([d.clear('drops'), d.clear('blobs'), d.clear('settings'), d.clear('outbox')])
}
