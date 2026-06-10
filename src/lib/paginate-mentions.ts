/**
 * Server-side "load more" pagination helper. The caller over-fetches one row
 * beyond the page size (pageSize + 1); if the probe row came back there is a
 * next page. Returns the visible page (probe trimmed) and a hasMore flag.
 */
export function paginateMentions<T>(
  rows: T[],
  pageSize: number,
): { visible: T[]; hasMore: boolean } {
  const hasMore = rows.length > pageSize
  return { visible: hasMore ? rows.slice(0, pageSize) : rows, hasMore }
}
