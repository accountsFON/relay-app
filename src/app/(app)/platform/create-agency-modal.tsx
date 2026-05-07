'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAgency } from './actions'
import type { Plan } from '@/lib/types'

export function CreateAgencyButton() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<Plan>('smb')

  const onSubmit = () => {
    setError(null)
    startTransition(async () => {
      try {
        await createAgency({ name, plan })
        setOpen(false)
        setName('')
        setPlan('smb')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create agency')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Create new agency</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">New agency</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agency-name">Agency name</Label>
                <Input
                  id="agency-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Marketing"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-plan">Plan</Label>
                <select
                  id="agency-plan"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as Plan)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="smb">SMB</option>
                  <option value="agency">Agency</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={onSubmit} disabled={isPending || !name.trim()}>
                  {isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
