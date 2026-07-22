'use client'

import { FeedShell } from '@/components/preview/feed-shell'

// Stub feed cards. This page exists so the "Social Preview" heading + scroll
// column can be Playwright-verified independently. Previews are Facebook-only
// now (the Instagram/Facebook toggle was retired; IG chrome left dormant).
const stubPosts = [
  { id: 'post-1', label: 'First demo post' },
  { id: 'post-2', label: 'Second demo post' },
  { id: 'post-3', label: 'Third demo post' },
]

export default function FeedShellDesignPage() {
  return (
    <FeedShell>
      {stubPosts.map((post) => (
        <div
          key={post.id}
          data-testid={`stub-fb-${post.id}`}
          className="rounded-lg border border-neutral-200 bg-card p-4 text-sm"
        >
          FB: {post.id} , {post.label}
        </div>
      ))}
    </FeedShell>
  )
}
