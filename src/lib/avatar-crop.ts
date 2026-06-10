// Client util (uses DOM in getCroppedImageBlob). No server imports.

export interface CropPixels { x: number; y: number; width: number; height: number }

export interface CanvasDrawArgs {
  sx: number; sy: number; sWidth: number; sHeight: number
  dx: number; dy: number; dWidth: number; dHeight: number
}

/** Pure: source crop rect -> square output draw args. */
export function computeCanvasDrawArgs(crop: CropPixels, outputSize: number): CanvasDrawArgs {
  return {
    sx: crop.x, sy: crop.y, sWidth: crop.width, sHeight: crop.height,
    dx: 0, dy: 0, dWidth: outputSize, dHeight: outputSize,
  }
}

/**
 * Draw the cropped region of an image source onto a square canvas and export
 * a webp Blob. Browser-only. `imageSrc` is an object URL for the picked file.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  crop: CropPixels,
  outputSize = 512,
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  const a = computeCanvasDrawArgs(crop, outputSize)
  ctx.drawImage(image, a.sx, a.sy, a.sWidth, a.sHeight, a.dx, a.dy, a.dWidth, a.dHeight)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/webp',
      0.9,
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
