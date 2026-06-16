/**
 * Regenerate the Relay app icons + favicon from the brand source mark.
 *
 * The mark (`public/brand/icon-r-dark.svg`, the dark navy "R") is rasterized,
 * trimmed to its tight bounds, inset with padding so it survives rounded /
 * maskable masking, and composited onto a solid brand off-white (`--neutral-50`,
 * #F6F7F6) square. The off-white matches the PWA splash `background_color` in
 * `manifest.ts`, so the install / launch transition reads as one continuous
 * surface and the dark R never disappears on a dark home screen or tab strip.
 *
 * Run with: `node scripts/generate-icons.mjs`
 * Requires ImageMagick (`magick`) on PATH for the multi-resolution .ico.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(root, 'public/brand/icon-r-dark.svg')
const BG = '#F6F7F6' // --neutral-50, matches manifest background_color

// Fraction of the canvas the mark's longest side occupies. ~0.74 leaves a
// ~13% margin on each side — inside the maskable safe zone (inner 80%).
const MARK_RATIO = 0.74

/** Render the SVG mark, trimmed to its tight transparent bounds, sized so its
 *  longest side is `target` px. Returns a PNG buffer (transparent background). */
async function renderMark(target) {
  // Rasterize the SVG large (high density) so downscaling stays crisp.
  const raster = await sharp(SRC, { density: 600 })
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  // Trim the transparent border to get the mark's tight bounds, then fit the
  // longest side to `target`.
  return sharp(raster)
    .trim()
    .resize(target, target, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
}

/** Build one square icon: mark centered on a solid BG canvas of `size` px. */
async function buildIcon(size, outPath) {
  const target = Math.round(size * MARK_RATIO)
  const mark = await renderMark(target)
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(outPath)
  console.log(`wrote ${outPath} (${size}x${size}, mark ${target}px on ${BG})`)
}

async function main() {
  const pub = join(root, 'public')

  // PWA + apple icons referenced by manifest.ts and layout.tsx metadata.
  await buildIcon(192, join(pub, 'icon-192.png'))
  await buildIcon(512, join(pub, 'icon-512.png'))
  await buildIcon(180, join(pub, 'apple-touch-icon.png'))

  // favicon.ico — multi-resolution (16/32/48). Build the PNGs, then let
  // ImageMagick pack them into a single .ico, written to both the App Router
  // location (canonical, auto-served by Next) and public/ (legacy duplicate).
  const tmp = mkdtempSync(join(tmpdir(), 'relay-favicon-'))
  try {
    const sizes = [16, 32, 48]
    const pngs = []
    for (const s of sizes) {
      const p = join(tmp, `favicon-${s}.png`)
      await buildIcon(s, p)
      pngs.push(p)
    }
    for (const dest of [join(root, 'src/app/favicon.ico'), join(pub, 'favicon.ico')]) {
      execFileSync('magick', [...pngs, dest])
      console.log(`wrote ${dest} (${sizes.join('/')})`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
