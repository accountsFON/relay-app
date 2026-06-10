'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'

/**
 * PostListCollapseContext, a per parent state map keyed by post id.
 *
 * Default state for every card is expanded. The provider also exposes a
 * setAll() helper so the batch detail page can offer an Expand all /
 * Collapse all button. Individual cards remain free to toggle themselves
 * after a global setAll(), because each id keeps its own entry in the map.
 */
type PostListCollapseValue = {
  isCollapsed: (postId: string) => boolean
  toggle: (postId: string) => void
  setCollapsed: (postId: string, collapsed: boolean) => void
  setAll: (collapsed: boolean) => void
  allExpanded: boolean
  ids: readonly string[]
}

const PostListCollapseContext = createContext<PostListCollapseValue | null>(
  null,
)

export function PostListCollapseProvider({
  postIds,
  defaultCollapsed = false,
  children,
}: {
  postIds: readonly string[]
  defaultCollapsed?: boolean
  children: ReactNode
}) {
  // Sparse map: an id missing from the map falls back to defaultCollapsed.
  // That keeps the map small for typical (collapse all) usage.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const isCollapsed = useCallback(
    (postId: string) => {
      if (postId in overrides) return overrides[postId]
      return defaultCollapsed
    },
    [overrides, defaultCollapsed],
  )

  const setCollapsed = useCallback((postId: string, collapsed: boolean) => {
    setOverrides((prev) => ({ ...prev, [postId]: collapsed }))
  }, [])

  const toggle = useCallback(
    (postId: string) => {
      setOverrides((prev) => {
        const current = postId in prev ? prev[postId] : defaultCollapsed
        return { ...prev, [postId]: !current }
      })
    },
    [defaultCollapsed],
  )

  const setAll = useCallback(
    (collapsed: boolean) => {
      const next: Record<string, boolean> = {}
      for (const id of postIds) next[id] = collapsed
      setOverrides(next)
    },
    [postIds],
  )

  const allExpanded = useMemo(() => {
    if (postIds.length === 0) return false
    return postIds.every((id) => {
      if (id in overrides) return overrides[id] === false
      return defaultCollapsed === false
    })
  }, [overrides, postIds, defaultCollapsed])

  const value = useMemo<PostListCollapseValue>(
    () => ({ isCollapsed, toggle, setCollapsed, setAll, allExpanded, ids: postIds }),
    [isCollapsed, toggle, setCollapsed, setAll, allExpanded, postIds],
  )

  return (
    <PostListCollapseContext.Provider value={value}>
      {children}
    </PostListCollapseContext.Provider>
  )
}

export function usePostListCollapse() {
  return useContext(PostListCollapseContext)
}

/**
 * PostListExpandAllToggle, a single button that flips every card's collapse
 * state at once. Renders nothing when there are no posts.
 */
export function PostListExpandAllToggle({
  className,
}: {
  className?: string
}) {
  const ctx = usePostListCollapse()
  if (!ctx || ctx.ids.length === 0) return null
  const label = ctx.allExpanded ? 'Collapse all' : 'Expand all'
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => ctx.setAll(ctx.allExpanded)}
      className={className}
      aria-label={label}
    >
      {label}
    </Button>
  )
}
