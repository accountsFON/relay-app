export type SocialPlannerPost = {
  /** Post date, YYYY-MM-DD. */
  date: string
  caption: string
  /** Space-joined hashtag string, e.g. "#a #b". May be empty. */
  hashtags: string
  /** Uploaded image URL (mediaUrls[0]); empty string when none. */
  mediaUrl: string
}

const HEADER =
  'postAtSpecificTime (YYYY-MM-DD HH:mm:ss),content,link (OGmetaUrl),imageUrls,gifUrl,videoUrls'

const IMAGE_PLACEHOLDER = 'https://#'

/**
 * Wrap a field in double quotes and escape inner quotes (doubling them) when it
 * contains a comma, double quote, or newline. Otherwise return it unchanged.
 */
export function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * caption + one blank line + hashtag block. Each part is trimmed of leading/
 * trailing whitespace (so no leading/trailing blank lines), and a missing part
 * is omitted entirely. Interior line breaks in the caption are preserved.
 */
function buildContent(caption: string, hashtags: string): string {
  return [caption.trim(), hashtags.trim()].filter(Boolean).join('\n\n')
}

/**
 * Render posts as a GoHighLevel Social Planner bulk-import CSV string.
 * Columns: postAtSpecificTime, content, link, imageUrls, gifUrl, videoUrls.
 * Time always defaults to 08:00. imageUrls carries the uploaded image, or the
 * https://# placeholder when the post has none. Rows are joined with CRLF.
 */
export function toSocialPlannerCsv(posts: SocialPlannerPost[]): string {
  const rows = posts.map((p) => {
    const imageUrls = p.mediaUrl ? p.mediaUrl : IMAGE_PLACEHOLDER
    return [
      `${p.date} 08:00`,
      escapeCsv(buildContent(p.caption, p.hashtags)),
      '',
      escapeCsv(imageUrls),
      '',
      '',
    ].join(',')
  })
  return [HEADER, ...rows].join('\r\n')
}
