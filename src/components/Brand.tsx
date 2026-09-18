import markUrl from '../assets/lifedrop-mark.png'

/**
 * The LifeDrop mark, from the supplied logo artwork: a ribbon that folds into
 * both a drop and an "L". It is raster, so it is used as artwork rather than
 * re-traced — only the ground outside the silhouette is transparent. The whites
 * inside the ribbon are part of the design and are kept, which is why the mark
 * sits on a light plate on dark grounds.
 */

export function DropMark({ size = 64, plate }: { size?: number; plate?: boolean }) {
  const img = (
    <img
      src={markUrl}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flex: 'none' }}
    />
  )

  if (!plate) return img

  // On a dark ground the mark's interior whites need something to sit on.
  return (
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size * 1.28,
        height: size * 1.28,
        borderRadius: size * 0.28,
        background: '#FFFFFF',
        flex: 'none',
      }}
    >
      {img}
    </span>
  )
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="display"
      style={{ fontSize: size, letterSpacing: '-1.1px', lineHeight: 1.1, color: 'var(--text)' }}
    >
      LifeDrop
    </span>
  )
}

/** Mark + wordmark. Below 96px wide the tagline is dropped, per the brand guide. */
export function Lockup({ mark = 56, tagline = true }: { mark?: number; tagline?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <DropMark size={mark} />
      <div style={{ textAlign: 'center' }}>
        <Wordmark size={mark * 0.52} />
        {tagline && (
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
            Drop it. LifeDrop remembers.
          </div>
        )}
      </div>
    </div>
  )
}

/** The ripple rings behind the mark on Splash, Processing and Saved. */
export function Ripples({ size = 180, color = 'var(--primary)' }: { size?: number; color?: string }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="anim-ripple"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: 999,
            border: `1.5px solid ${color}`,
            animationDelay: `${i * 520}ms`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}
