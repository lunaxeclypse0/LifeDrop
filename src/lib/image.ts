/**
 * Phone cameras produce 4–12MB files. Sending those straight up is slow on
 * mobile data, counts against the model's free tier faster, and can exceed the
 * serverless request limit. A bill only needs enough resolution for the text to
 * be legible, so it is downscaled before it leaves the device. The user's
 * original is still stored locally at full size.
 */

// Tuned down from 1600 / 0.85: on Philippine mobile data the upload was the
// slowest part of a scan, and printed receipt text is still comfortably legible
// here. Smaller images also cost fewer of the free tier's tokens per read.
const MAX_EDGE = 1400
const QUALITY = 0.75

export async function downscaleForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file // PDFs go up untouched

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

    // Already small enough, and re-encoding would only lose detail.
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close()
      return file
    }

    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    if (!blob || blob.size >= file.size) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    // Any failure here is not worth blocking the drop over.
    return file
  }
}
