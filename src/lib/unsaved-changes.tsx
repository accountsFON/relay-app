'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export const UNSAVED_CHANGES_MESSAGE =
  'You have unsaved changes. Leave without saving?'

/**
 * Mounted once near the root. While `hasUnsavedChanges` is true it intercepts
 * in-app navigation and prompts before the draft is discarded:
 *  - hard unload (close tab / reload / new URL) via beforeunload
 *  - same-origin link clicks via a capture-phase document click listener
 *  - the back / forward button via a popstate "trap" entry
 * Programmatic router.push is intentionally not intercepted (see the design doc).
 */
export function NavigationGuard({
  hasUnsavedChanges,
}: {
  hasUnsavedChanges: boolean
}) {
  useEffect(() => {
    if (!hasUnsavedChanges) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return
      const target = e.target as HTMLElement | null
      const anchor = target?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      const targetAttr = anchor.getAttribute('target')
      if (targetAttr && targetAttr !== '_self') return
      if (anchor.hasAttribute('download')) return
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      // a pure same-page hash link does not discard SPA state
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      )
        return
      if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Back-button trap: push a duplicate entry so the first Back press fires
    // popstate without leaving the page, then confirm.
    let leaving = false
    window.history.pushState(
      { __unsavedTrap: true },
      '',
      window.location.href,
    )
    const onPopState = () => {
      if (leaving) {
        leaving = false
        return
      }
      if (window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        leaving = true
        window.history.back()
      } else {
        window.history.pushState(
          { __unsavedTrap: true },
          '',
          window.location.href,
        )
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('popstate', onPopState)
      // Pop the trap ONLY when it is still the current entry (the common save /
      // cancel case, where we never navigated). We intentionally do NOT pop
      // unconditionally: after a confirmed link navigation the user is already
      // on a new page, and an unconditional history.back() here would yank
      // them backward. The cost is a harmless duplicate entry (same URL as the
      // page we left) sitting in history in that path. Forward-while-dirty
      // also prompts, by design, since unsaved data would be lost either
      // direction.
      const state = window.history.state as { __unsavedTrap?: boolean } | null
      if (state?.__unsavedTrap) window.history.back()
    }
  }, [hasUnsavedChanges])

  return null
}

type Registry = {
  setDirty: (id: string, dirty: boolean) => void
  unregister: (id: string) => void
  hasUnsavedChanges: boolean
}

const UnsavedChangesContext = createContext<Registry | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirtyIds = useRef<Set<string>>(new Set())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const recompute = useCallback(() => {
    setHasUnsavedChanges(dirtyIds.current.size > 0)
  }, [])

  const setDirty = useCallback(
    (id: string, dirty: boolean) => {
      if (dirty) dirtyIds.current.add(id)
      else dirtyIds.current.delete(id)
      recompute()
    },
    [recompute],
  )

  const unregister = useCallback(
    (id: string) => {
      dirtyIds.current.delete(id)
      recompute()
    },
    [recompute],
  )

  const value = useMemo<Registry>(
    () => ({ setDirty, unregister, hasUnsavedChanges }),
    [setDirty, unregister, hasUnsavedChanges],
  )

  return (
    <UnsavedChangesContext.Provider value={value}>
      <NavigationGuard hasUnsavedChanges={hasUnsavedChanges} />
      {children}
    </UnsavedChangesContext.Provider>
  )
}

/** Read whether anything in the tree currently has an unsaved draft. */
export function useHasUnsavedChanges(): boolean {
  return useContext(UnsavedChangesContext)?.hasUnsavedChanges ?? false
}

/**
 * Report this editor's dirty state to the guard. No-ops safely when no
 * provider is mounted (e.g. isolated component tests).
 */
export function useUnsavedChanges(dirty: boolean) {
  const ctx = useContext(UnsavedChangesContext)
  const id = useId()
  useEffect(() => {
    ctx?.setDirty(id, dirty)
    return () => ctx?.unregister(id)
  }, [ctx, id, dirty])
}
