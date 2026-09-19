import { useEffect, useState, type ReactNode } from 'react'
import { Illustration, type Art } from './Illustration'
import { Icon } from './Icon'
import { getBlob } from '../lib/db'
import { Tile } from './UI'
import type { Drop } from '../lib/types'
import { cacheImage } from '../lib/sync'

export function EmptyState({
  art,
  title,
  body,
  action,
}: {
  art: Art
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="art">
        <Illustration art={art} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="dropcard" style={{ '--d': `${i * 45}ms` } as React.CSSProperties}>
          <span className="skel" style={{ width: 42, height: 42, borderRadius: 13, flex: 'none' }} />
          <span className="mid">
            <span className="skel" style={{ display: 'block', height: 13, width: '58%' }} />
            <span className="skel" style={{ display: 'block', height: 11, width: '38%', marginTop: 8 }} />
            <span className="skel" style={{ display: 'block', height: 16, width: 74, marginTop: 10, borderRadius: 8 }} />
          </span>
          <span className="skel" style={{ width: 54, height: 15, flex: 'none' }} />
        </div>
      ))}
    </div>
  )
}

export function OfflineBanner() {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
        borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
      }}
    >
      <Icon name="wifi" size={20} color="var(--warning)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>You are offline</div>
        <div className="caption" style={{ marginTop: 2 }}>
          Your vault still works. New drops are read when you reconnect.
        </div>
      </div>
    </div>
  )
}

/**
 * The user's original drop. Where no image was stored — seeded items, manual
 * entries — the brand guide calls for a labelled document placeholder rather
 * than stock imagery.
 */
export function DropPreview({
  drop,
  height = 190,
}: {
  drop: Drop
  height?: number
}) {
  const { imageId, imagePath, fileName, category } = drop
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let made: string | null = null

    void (async () => {
      // Prefer the local copy; fall back to pulling it out of the bucket, which
      // is the case on a second device that has never seen this drop's photo.
      let blob = imageId ? await getBlob(imageId) : null
      if (!blob && imagePath) {
        const cached = await cacheImage(drop)
        if (cached) blob = await getBlob(cached)
      }
      if (!blob || revoked) return
      made = URL.createObjectURL(blob)
      setUrl(made)
    })()

    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [imageId, imagePath, drop])

  const isImage = /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(fileName) || !!url

  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <img
          src={url}
          alt={`Original drop: ${fileName}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Tile category={category} size="lg" />
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700 }}>{fileName}</div>
          <div className="caption" style={{ marginTop: 2 }}>
            {isImage ? 'Original screenshot' : 'Original document'}
          </div>
        </div>
      )}
    </div>
  )
}
