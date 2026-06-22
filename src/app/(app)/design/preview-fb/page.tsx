import { FacebookPost } from '@/components/preview/facebook-post'
import type { FeedPostProps } from '@/types/preview'

const SAMPLE_POSTS: FeedPostProps[] = [
  {
    post: {
      id: 'sample-fb-1',
      caption:
        "Welcome to our new patio space. Sundays just got better, and we can't wait to see you for our community brunch.",
      hashtags: ['#community', '#sundaybrunch'],
      mediaUrl: null,
    },
    client: {
      name: 'Old Plank Christian Academy',
      avatarUrl: null,
    },
    threads: [],
    mode: 'internal',
  },
  {
    post: {
      id: 'sample-fb-2',
      caption:
        "Spring enrollment is open. Tour our campus, meet the team, and see why families have trusted us for over 30 years to shape character, build curiosity, and grow lifelong friendships. Limited seats remaining for the fall cohort, so book a tour this week. We'd love to walk you through the new science wing, the redesigned library, and the outdoor classroom that students helped design last semester. Visit our site or DM us to schedule a time that works for your family. We're booking through the end of the month and seats are filling up fast.",
      hashtags: ['#enrollment', '#privateschool', '#chooseopca'],
      mediaUrl: null,
    },
    client: {
      name: 'Old Plank Christian Academy',
      avatarUrl: null,
    },
    threads: [
      {
        id: 'thread-fb-img-1',
        status: 'open',
        pin: { kind: 'image', x: 30, y: 45 },
        firstComment: {
          author: { kind: 'am', userId: 'u1', name: 'Mollie Huebner' },
          body: 'Can we crop tighter on the left?',
          createdAt: new Date('2026-05-16T10:00:00Z'),
        },
        comments: [
          {
            author: { kind: 'am', userId: 'u1', name: 'Mollie Huebner' },
            body: 'Can we crop tighter on the left?',
            createdAt: new Date('2026-05-16T10:00:00Z'),
          },
        ],
        commentCount: 1,
      },
      {
        id: 'thread-fb-cap-1',
        status: 'open',
        pin: { kind: 'caption', from: 0, to: 19 },
        firstComment: {
          author: { kind: 'client', reviewerName: 'Pastor Dan' },
          body: 'Lead with the date instead.',
          createdAt: new Date('2026-05-16T11:00:00Z'),
        },
        comments: [
          {
            author: { kind: 'client', reviewerName: 'Pastor Dan' },
            body: 'Lead with the date instead.',
            createdAt: new Date('2026-05-16T11:00:00Z'),
          },
          {
            author: { kind: 'am', userId: 'u1', name: 'Mollie Huebner' },
            body: 'Done, take a look.',
            createdAt: new Date('2026-05-16T11:20:00Z'),
          },
        ],
        commentCount: 2,
      },
    ],
    mode: 'internal',
  },
  {
    post: {
      id: 'sample-fb-3',
      caption:
        'Last call for VBS volunteers. Lunch is on us and the t shirts are nicer than last year.',
      hashtags: [],
      mediaUrl: null,
    },
    client: {
      name: 'Cedar Creek Dental',
      avatarUrl: null,
    },
    threads: [],
    mode: 'review',
  },
]

export default function PreviewFbDesignPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Preview FB design surface</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Layer 1 / Task 1.2 mid fidelity Facebook post chrome. Renders three
          fixture posts so the driver can verify chrome, truncation, and pin
          rendering.
        </p>
      </header>
      {SAMPLE_POSTS.map((sample) => (
        <FacebookPost key={sample.post.id} {...sample} />
      ))}
    </div>
  )
}
