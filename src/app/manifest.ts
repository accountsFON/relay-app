import type { MetadataRoute } from 'next'

/**
 * Web app manifest for the Relay PWA. Wires up the brand icons dropped into
 * `public/` during Phase 2.5A.3 so Chrome / iOS / Android can use them when
 * the app is installed to the home screen.
 *
 * Theme color sourced from `--neutral-50` (page background) so the splash
 * matches the in-app surface chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Relay',
    short_name: 'Relay',
    description: 'A marketing tool for people who ship.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F6F7F6',
    theme_color: '#F6F7F6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
