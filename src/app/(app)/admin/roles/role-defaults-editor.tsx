'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { updateRoleDefaults } from './actions'
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  SYSTEM_DEFAULTS,
  type PermissionKey,
} from '@/server/auth/permissions'
import type { UserRole } from '@/lib/types'

type SelectionState = 'allow' | 'deny' | 'inherit'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  account_manager: 'AM',
  designer: 'Designer',
  client: 'Client',
}

type Props = {
  role: UserRole
  /** Current org overrides for this role (sparse). */
  initialOverrides: Partial<Record<PermissionKey, boolean>>
}

export function RoleDefaultsEditor({ role, initialOverrides }: Props) {
  const initial = useMemo(
    () =>
      Object.fromEntries(
        PERMISSION_KEYS.map((key) => {
          const v = initialOverrides[key]
          const sel: SelectionState =
            v === undefined ? 'inherit' : v ? 'allow' : 'deny'
          return [key, sel]
        }),
      ) as Record<PermissionKey, SelectionState>,
    [initialOverrides],
  )

  const [state, setState] =
    useState<Record<PermissionKey, SelectionState>>(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const dirty = useMemo(
    () => PERMISSION_KEYS.some((key) => state[key] !== initial[key]),
    [state, initial],
  )

  const setSelection = (key: PermissionKey, sel: SelectionState) => {
    setState((prev) => ({ ...prev, [key]: sel }))
    setSavedAt(null)
  }

  const resetAll = () => {
    setState(
      Object.fromEntries(
        PERMISSION_KEYS.map((k) => [k, 'inherit' as SelectionState]),
      ) as Record<PermissionKey, SelectionState>,
    )
    setSavedAt(null)
  }

  const onSave = () => {
    setError(null)
    const overrides: Partial<Record<PermissionKey, boolean | null>> = {}
    for (const key of PERMISSION_KEYS) {
      const sel = state[key]
      if (sel === 'inherit') overrides[key] = null
      else overrides[key] = sel === 'allow'
    }

    startTransition(async () => {
      try {
        await updateRoleDefaults({ role, overrides })
        setSavedAt(Date.now())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      }
    })
  }

  return (
    <div>
      <div className="border-b border-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">
            {ROLE_LABEL[role]} role defaults
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            These apply to all users with the {ROLE_LABEL[role]} role unless
            overridden per user.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetAll}
          disabled={isPending}
        >
          Reset all to system defaults
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Permission</th>
              <th className="px-4 py-2">System default</th>
              <th className="px-4 py-2">Org setting</th>
              <th className="px-4 py-2">Effective</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_KEYS.map((key) => {
              const sel = state[key]
              const systemDefault = SYSTEM_DEFAULTS[role][key]
              const effective =
                sel === 'inherit' ? systemDefault : sel === 'allow'
              const isOverride = sel !== 'inherit'
              return (
                <tr
                  key={key}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {PERMISSION_LABELS[key]}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {key}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {systemDefault ? 'Allow' : 'Deny'}
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
                            name={`${role}-${key}`}
                            checked={sel === s}
                            onChange={() => setSelection(key, s)}
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
          {isPending ? 'Saving…' : 'Save defaults'}
        </Button>
      </div>
    </div>
  )
}
