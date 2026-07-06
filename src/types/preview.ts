import type { MentionTarget } from '@/lib/mentions';

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
    firstComment: {
      id: string;
      author: ThreadAuthor;
      body: string;
      createdAt: Date;
      imageUrl?: string | null;
      imageWidth?: number | null;
      imageHeight?: number | null;
    };
    comments: ReadonlyArray<{
      id: string;
      author: ThreadAuthor;
      body: string;
      createdAt: Date;
      imageUrl?: string | null;
      imageWidth?: number | null;
      imageHeight?: number | null;
    }>;
    commentCount: number;
  }>;
  // 'internal' = AM Clerk-authenticated; 'review' = magic-link client view
  mode: 'internal' | 'review';
  /** Media editor may replace the post image in place (drop + pick). */
  canReplaceImage?: boolean;
  // Callbacks the host page wires up (Layer 2)
  // onCreateThread: drop a new thread (image pin, caption-range, or post-level).
  // When omitted, the markup overlay + caption selection composer do not drop
  // new pins on click.
  onCreateThread?: (pin: PinLocation, body: string, image?: { url: string; width?: number; height?: number }) => Promise<void>;
  // onComment: append a comment to an existing thread (both modes can use).
  onComment?: (threadId: string, body: string, image?: { url: string; width?: number; height?: number }) => Promise<void>;
  // onUploadImage: upload a file and return the stored URL + dimensions.
  // The composer calls this before submitting a thread/comment so the server
  // action receives a URL rather than a raw File.
  onUploadImage?: (file: File) => Promise<{ url: string; width: number; height: number }>;
  // onUseAsPostImage: AM-only. Called when the AM clicks "Use as post image"
  // on a comment's attached image. Receives the comment id. The host wires
  // this to useCommentImageAsPostMediaAction + handleRefresh.
  onUseAsPostImage?: (commentId: string) => Promise<void>;
  // onResolveThread: AM-only resolve action. Reviewers omit this prop and the
  // resolve button is hidden in the popover.
  onResolveThread?: (threadId: string) => Promise<void>;
  // onOpenThread: optional external open-callback fired in addition to the
  // post component's internal openThreadId state (legacy hook for tests).
  onOpenThread?: (threadId: string) => void;

  // Inline caption-edit (v2 client review surface only). When `editing` is
  // true the caption text inside the chrome is replaced by a textarea bound
  // to `captionDraft` + `onCaptionDraftChange`, with Save/Cancel buttons
  // wired to `onCaptionEditSave` / `onCaptionEditCancel`.
  editing?: boolean;
  captionDraft?: string;
  onCaptionDraftChange?: (draft: string) => void;
  onCaptionEditSave?: () => Promise<void> | void;
  onCaptionEditCancel?: () => void;
  // When the reviewer has saved a suggested caption, the host passes it via
  // `captionOverride` so the chrome renders the suggestion in place of
  // `post.caption`. A `view original / back to your edit` toggle is rendered
  // beneath the caption when this is set.
  captionOverride?: string;
  // onEditCaption: client review surface only. When provided, an inline
  // "Edit copy" affordance renders beneath the caption; tapping it asks the
  // host to enter caption edit mode. Only ReviewPostCard passes it, so the
  // link does not appear on the AM / designer preview surfaces.
  onEditCaption?: () => void;
  // suppressInlinePopover: when true, clicking a pin calls onOpenThread but
  // does NOT open the component's internal PinPopover. Intended for host
  // surfaces (e.g. the sidebar-driven client review view) that render thread
  // detail in their own panel rather than the floating popover.
  suppressInlinePopover?: boolean;
  // mentionRoster: internal @-mention roster (AM + designer + admins). When
  // non-empty, the new-pin draft composer + the pin reply popover show an @
  // autocomplete dropdown. Defaulted to [] so the client review path (which
  // passes no roster) renders no autocomplete and is unchanged. The composer
  // still submits a plain body; the server actions resolve ids from body +
  // the server-side roster, so this prop drives the autocomplete UI only.
  mentionRoster?: MentionTarget[];
};
