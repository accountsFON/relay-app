'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Create new agency</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New agency</DialogTitle>
          <DialogDescription>
            Provisions a fresh organization. You can step into it after creation.
          </DialogDescription>
        </DialogHeader>
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
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-plan">Plan</Label>
            <select
              id="agency-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="smb">SMB</option>
              <option value="agency">Agency</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending || !name.trim()}>
            {isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
