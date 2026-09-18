import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Button, TopBar } from '../components/UI'
import { useApp } from '../lib/store'
import type { DropSource } from '../lib/types'

function startPending(
  setPending: (p: { source: DropSource; previewUrl: string | null; extraction: null }) => void,
  file: File,
  kind: DropSource['kind'],
) {
  const isImage = file.type.startsWith('image/')
  setPending({
    source: { file, kind },
    previewUrl: isImage ? URL.createObjectURL(file) : null,
    extraction: null,
  })
}

/** Live camera capture. Falls back to the OS camera when getUserMedia is blocked. */
export function CameraCapture() {
  const navigate = useNavigate()
  const setPending = useApp((s) => s.setPending)
  const showToast = useApp((s) => s.showToast)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        if (!cancelled) setError('LifeDrop cannot reach the camera on this device.')
      }
    })()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const shoot = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast('That shot did not come through. Try again.')
          return
        }
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
        navigator.vibrate?.(10) // light haptic on capture
        startPending(setPending, file, 'camera')
        navigate('/processing')
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div className="screen" style={{ background: '#000' }}>
      <TopBar
        title={<span style={{ color: '#fff' }}>Scan</span>}
        back
        right={
          <button
            className="iconbtn"
            style={{ background: 'rgba(255,255,255,.12)', borderColor: 'transparent', color: '#fff' }}
            onClick={() => fallbackRef.current?.click()}
            aria-label="Pick a file instead"
          >
            <Icon name="image" size={20} />
          </button>
        }
      />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
        />

        {/* framing guides */}
        {ready && (
          <div style={{ position: 'absolute', inset: '12% 10%', pointerEvents: 'none' }}>
            {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
              <span
                key={corner}
                style={{
                  position: 'absolute',
                  width: 30,
                  height: 30,
                  borderStyle: 'solid',
                  borderColor: '#fff',
                  borderWidth: 0,
                  borderTopWidth: corner[0] === 'n' ? 3 : 0,
                  borderBottomWidth: corner[0] === 's' ? 3 : 0,
                  borderLeftWidth: corner[1] === 'w' ? 3 : 0,
                  borderRightWidth: corner[1] === 'e' ? 3 : 0,
                  borderRadius: 6,
                  top: corner[0] === 'n' ? 0 : undefined,
                  bottom: corner[0] === 's' ? 0 : undefined,
                  left: corner[1] === 'w' ? 0 : undefined,
                  right: corner[1] === 'e' ? 0 : undefined,
                }}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              padding: 28,
              textAlign: 'center',
              color: '#fff',
            }}
          >
            <div>
              <Icon name="camera" size={40} color="rgba(255,255,255,.6)" />
              <p style={{ marginTop: 14, fontSize: 14.5, lineHeight: 1.55, opacity: 0.85 }}>{error}</p>
              <Button variant="secondary" onClick={() => fallbackRef.current?.click()} icon="image">
                Pick a photo instead
              </Button>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          flex: 'none',
          padding: `18px var(--gutter) calc(var(--safe-bottom) + 24px)`,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 30,
        }}
      >
        <button
          onClick={() => fallbackRef.current?.click()}
          aria-label="Choose from library"
          style={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }}
        >
          <Icon name="image" size={22} color="rgba(255,255,255,.8)" />
        </button>

        <button
          onClick={shoot}
          disabled={!ready}
          aria-label="Take the shot"
          style={{
            width: 72,
            height: 72,
            borderRadius: 999,
            background: '#fff',
            border: '4px solid rgba(255,255,255,.35)',
            backgroundClip: 'padding-box',
          }}
        />

        <span style={{ width: 44 }} />
      </div>

      <input
        ref={fallbackRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          startPending(setPending, file, 'camera')
          navigate('/processing')
        }}
      />
    </div>
  )
}

/** File / screenshot picker, plus paste from the clipboard. */
export function UploadPicker() {
  const navigate = useNavigate()
  const setPending = useApp((s) => s.setPending)
  const showToast = useApp((s) => s.showToast)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const take = (file: File, kind: DropSource['kind']) => {
    startPending(setPending, file, kind)
    navigate('/processing')
  }

  const paste = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) {
          const blob = await item.getType(type)
          take(new File([blob], `pasted-${Date.now()}.png`, { type }), 'paste')
          return
        }
      }
      showToast('No image on the clipboard.')
    } catch {
      showToast('This browser will not let LifeDrop read the clipboard.')
    }
  }

  return (
    <div className="screen">
      <TopBar title="Upload a drop" back />
      <div className="scrollhost no-nav">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) take(file, 'upload')
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          style={{
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            padding: '44px 20px',
            borderRadius: 20,
            border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
            background: dragging ? 'var(--primary-soft)' : 'var(--surface)',
            cursor: 'pointer',
            transition: 'border-color var(--t-fast) ease, background var(--t-fast) ease',
          }}
        >
          <Icon name="image" size={34} color="var(--primary)" />
          <div style={{ marginTop: 12, fontSize: 15.5, fontWeight: 700 }}>Choose a file</div>
          <div className="caption" style={{ marginTop: 4, maxWidth: 230 }}>
            Screenshots, photos and PDFs. Drag one here or tap to browse.
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" icon="paste" onClick={paste}>
            Paste from clipboard
          </Button>
        </div>

        <div style={{ marginTop: 10 }}>
          <Button variant="secondary" icon="edit" onClick={() => navigate('/review?manual=1')}>
            Enter the details myself
          </Button>
        </div>

        <p className="caption" style={{ textAlign: 'center', marginTop: 22, lineHeight: 1.5 }}>
          Your drops stay on this device. You review every reading before it is saved.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) take(file, 'upload')
          }}
        />
      </div>
    </div>
  )
}
