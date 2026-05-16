'use client'

import { useState } from 'react'
import { FeedShell } from '@/components/preview/feed-shell'
import type { Platform } from '@/components/preview/platform-toggle'

// Stub feed cards. The real Instagram and Facebook feed post components
// are being built in parallel (Tasks 1.1 + 1.2). Layer 2 task 2.1 composes
// this shell with those real components. This page exists so the toggle +
// scroll column can be Playwright-verified independently.
const stubPosts = [
  { id: 'post-1', label: 'First demo post' },
  { id: 'post-2', label: 'Second demo post' },
  { id: 'post-3', label: 'Third demo post' },
]

export default function FeedShellDesignPage() {
  const [platform, setPlatform] = useState<Platform>('instagram')

  return (
    <FeedShell platform={platform} onPlatformChange={setPlatform}>
      {stubPosts.map((post) =>
        platform === 'instagram' ? (
          <div
            key={post.id}
            data-testid={`stub-ig-${post.id}`}
            className="rounded-lg border border-cream-80 bg-card p-4 text-sm"
          >
            IG: {post.id} , {post.label}
          </div>
        ) : (
          <div
            key={post.id}
            data-testid={`stub-fb-${post.id}`}
            className="rounded-lg border border-cream-80 bg-card p-4 text-sm"
          >
            FB: {post.id} , {post.label}
          </div>
        ),
      )}
    </FeedShell>
  )
}
