'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { updateMembershipPermissions } from './actions'
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  READ_ONLY_OVERRIDE,
  type PermissionKey,
} from '@/server/auth/permissions'

type SelectionState = 'allow' | 'deny' | 'inherit'

type Row = {
  key: PermissionKey
  label: string
  defaultValue: boolean
  selection: SelectionState
}

type Props = {
  userId: string
  /** Boolean default (system + role-default merged) per key. */
  defaultsByKey: Partial<Record<PermissionKey, boolean>>
  /** Current sparse user overrides (omitted keys mean "inherit"). */
  initialOverrides: Partial<Record<PermissionKey, boolean>>
}

export function PermissionEditor({
  userId,
  defaultsByKey,
  initialOverrides,
}: Props) {
  const initialRows = useMemo<Row[]>(
    () =>
      PERMISSION_KEYS.map((key) => {
        const override = initialOverrides[key]
        const selection: SelectionState =
          override === undefined ? 'inherit' : override ? 'allow' : 'deny'
        return {
          key,
          label: PERMISSION_LABELS[key],
          defaultValue: defaultsByKey[key] ?? false,
          selection,
        }
      }),
    [defaultsByKey, initialOverrides],
  )

  const [rows, setRows] = useState<Row[]>(initialRows)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const dirty = useMemo(
    () =>
      rows.some(
        (r, i) => r.selection !== initialRows[i].selection,
      ),
    [rows, initialRows],
  )

  const setSelection = (key: PermissionKey, selection: SelectionState) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, selection } : r)),
    )
    setSavedAt(null)
  }

  const applyReadOnly = () => {
    setRows((prev) =>
      prev.map((r) => {
        const v = READ_ONLY_OVERRIDE[r.key]
        if (v === undefined) return r
        return { ...r, selection: v ? 'allow' : 'deny' }
      }),
    )
    setSavedAt(null)
  }

  const resetToDefaults = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selection: 'inherit' })))
    setSavedAt(null)
  }

  const onSave = () => {
    setError(null)
    const overrides: Partial<Record<PermissionKey, boolean | null>> = {}
    for (const r of rows) {
      if (r.selection === 'inherit') overrides[r.key] = null
      else overrides[r.key] = r.selection === 'allow'
    }

    startTransition(async () => {
      try {
        await updateMembershipPermissions({ userId, overrides })
        setSavedAt(Date.now())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save permissions')
      }
    })
  }

  return (
    <div>
      <div className="border-b border-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">Permissions</h2>
          <p className="text-xs text-muted-foreground mt-1">
            User overrides win over role defaults. &ldquo;Inherit&rdquo; clears
            the override.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyReadOnly}
            disabled={isPending}
          >
            Apply read-only preset
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            disabled={isPending}
          >
            Reset to role defaults
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Permission</th>
              <th className="px-4 py-2">Default</th>
              <th className="px-4 py-2">Setting</th>
              <th className="px-4 py-2">Effective</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const effective =
                r.selection === 'inherit'
                  ? r.defaultValue
                  : r.selection === 'allow'
              const isOverride = r.selection !== 'inherit'
              return (
                <tr
                  key={r.key}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.key}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.defaultValue ? 'Allow' : 'Deny'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      {(['allow', 'deny', 'inherit'] as const).map((s) => (
                        <label
                          key={s}
                          className="inline-flex items-center gap-1.5 text-sm"
                        >
                          <input
                            type="radio"
                            name={`perm-${r.key}`}
                            checked={r.selection === s}
                            onChange={() => setSelection(r.key, s)}
                            disabled={isPending}
                          />
                          <span className="capitalize">{s}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        effective ? 'text-foreground' : 'text-muted-foreground'
                      }
                    >
                      {effective ? 'Allow' : 'Deny'}
                    </span>
                    {isOverride && (
                      <span className="ml-2 text-xs text-amber-600">
                        ← override
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : savedAt ? (
            <span>Saved.</span>
          ) : dirty ? (
            <span>Unsaved changes.</span>
          ) : (
            <span>No changes.</span>
          )}
        </div>
        <Button onClick={onSave} disabled={!dirty || isPending}>
          {isPending ? 'Saving…' : 'Save permissions'}
        </Button>
      </div>
    </div>
  )
}
