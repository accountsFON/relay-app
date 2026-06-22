import { InstagramFeedPost } from '@/components/preview/instagram-post'
import type { FeedPostProps } from '@/types/preview'

/**
 * Design test route for the Instagram feed post component (Layer 1, Task 1.1).
 *
 * No DB lookups, no Clerk gates beyond the (app) layout. Renders inline fixture
 * data so the driver can Playwright the component in isolation.
 */

const SHORT_CAPTION = 'Sundays just got better. Brunch starts at 10.'

const LONG_CAPTION =
  "Welcome to our new patio space. Sundays just got better, and we cannot wait to see you for our community brunch this weekend. Come hungry, bring a friend, and grab a seat under the lights."

const SAMPLES: ReadonlyArray<FeedPostProps> = [
  {
    post: {
      id: 'demo-post-1',
      caption: SHORT_CAPTION,
      hashtags: ['community', 'brunch', 'oldplank'],
      mediaUrl:
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=800&fit=crop',
    },
    client: {
      name: 'Old Plank Christian',
      avatarUrl: null,
    },
    threads: [],
    mode: 'internal',
  },
  {
    post: {
      id: 'demo-post-2',
      caption: LONG_CAPTION,
      hashtags: ['community', 'brunch', 'oldplank', 'atlanta'],
      mediaUrl:
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=800&fit=crop',
    },
    client: {
      name: 'Old Plank Christian',
      avatarUrl:
        'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=120&h=120&fit=crop',
    },
    threads: [
      {
        id: 'thread-image-1',
        status: 'open',
        pin: { kind: 'image', x: 32, y: 48 },
        firstComment: {
          author: { kind: 'am', userId: 'user-1', name: 'Mollie' },
          body: 'Can we crop tighter on the food?',
          createdAt: new Date('2026-05-16T09:30:00Z'),
        },
        comments: [
          {
            author: { kind: 'am', userId: 'user-1', name: 'Mollie' },
            body: 'Can we crop tighter on the food?',
            createdAt: new Date('2026-05-16T09:30:00Z'),
          },
        ],
        commentCount: 1,
      },
      {
        id: 'thread-caption-1',
        status: 'open',
        pin: { kind: 'caption', from: 12, to: 30 },
        firstComment: {
          author: { kind: 'client', reviewerName: 'Christian' },
          body: "Can we say 'outdoor seating' instead?",
          createdAt: new Date('2026-05-16T10:05:00Z'),
        },
        comments: [
          {
            author: { kind: 'client', reviewerName: 'Christian' },
            body: "Can we say 'outdoor seating' instead?",
            createdAt: new Date('2026-05-16T10:05:00Z'),
          },
          {
            author: { kind: 'am', userId: 'user-1', name: 'Mollie' },
            body: 'Good call, updating now.',
            createdAt: new Date('2026-05-16T10:20:00Z'),
          },
        ],
        commentCount: 2,
      },
    ],
    mode: 'internal',
  },
  {
    post: {
      id: 'demo-post-3',
      caption:
        'Two threads on this one to verify multiple pin badges render and stack correctly underneath the caption block in the right order.',
      hashtags: ['preview', 'design'],
      mediaUrl: null,
    },
    client: {
      name: 'Demo Client',
      avatarUrl: null,
    },
    threads: [
      {
        id: 'thread-post-1',
        status: 'open',
        pin: { kind: 'post' },
        firstComment: {
          author: { kind: 'am', userId: 'user-1', name: 'Mollie' },
          body: 'Approved at the post level.',
          createdAt: new Date('2026-05-16T11:00:00Z'),
        },
        comments: [
          {
            author: { kind: 'am', userId: 'user-1', name: 'Mollie' },
            body: 'Approved at the post level.',
            createdAt: new Date('2026-05-16T11:00:00Z'),
          },
        ],
        commentCount: 1,
      },
      {
        id: 'thread-post-2',
        status: 'resolved',
        pin: { kind: 'post' },
        firstComment: {
          author: { kind: 'client', reviewerName: 'Sam' },
          body: 'Looks good now.',
          createdAt: new Date('2026-05-16T11:30:00Z'),
        },
        comments: [
          {
            author: { kind: 'client', reviewerName: 'Sam' },
            body: 'Looks good now.',
            createdAt: new Date('2026-05-16T11:30:00Z'),
          },
          {
            author: { kind: 'am', userId: 'user-1', name: 'Mollie' },
            body: 'Thanks for the quick turnaround.',
            createdAt: new Date('2026-05-16T11:45:00Z'),
          },
          {
            author: { kind: 'client', reviewerName: 'Sam' },
            body: 'Anytime!',
            createdAt: new Date('2026-05-16T12:00:00Z'),
          },
        ],
        commentCount: 3,
      },
    ],
    mode: 'review',
  },
]

export default function PreviewIgDesignPage() {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-[20px] font-semibold text-foreground">
          Instagram feed post · design preview
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Layer 1 / Task 1.1 reference render. Three sample posts with realistic
          fixture data. Pin badges are clickable but no-op until Layer 2 wires
          handlers.
        </p>
      </header>

      {SAMPLES.map((sample) => (
        <InstagramFeedPost key={sample.post.id} {...sample} />
      ))}
    </div>
  )
}
