// Used by Layer 1 IG/FB components and Layer 2 markup overlay
export type PinLocation =
  | { kind: 'post' }
  | { kind: 'image'; x: number; y: number } // 0..100 percent
  | { kind: 'caption'; from: number; to: number }; // char offsets

// Used by Layer 1 thread component and Layer 2 magic-link landing
export type ThreadAuthor =
  | { kind: 'am'; userId: string; name: string; avatarUrl?: string | null }
  | { kind: 'client'; reviewerName: string };

// Props for the IG/FB feed post components (Layer 1 task 1.1 + 1.2)
export type FeedPostProps = {
  post: {
    id: string;
    caption: string;
    hashtags: string[];
    mediaUrl: string | null;
  };
  client: {
    name: string;
    avatarUrl?: string | null;
  };
  threads: ReadonlyArray<{
    id: string;
    status: 'open' | 'resolved';
    pin: PinLocation;
    firstComment: { author: ThreadAuthor; body: string; createdAt: Date };
    commentCount: number;
  }>;
  // 'internal' = AM Clerk-authenticated; 'review' = magic-link client view
  mode: 'internal' | 'review';
  // Callbacks the host page wires up (Layer 2)
  onCreateThread?: (pin: PinLocation, body: string) => Promise<void>;
  onOpenThread?: (threadId: string) => void;
};
