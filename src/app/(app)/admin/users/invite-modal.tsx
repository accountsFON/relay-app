'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteMember } from './invite-actions'
import type { UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  account_manager: 'Account Manager',
  designer: 'Designer',
  client: 'Client',
}

export function InviteMemberButton() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('account_manager')

  const onSubmit = () => {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      try {
        await inviteMember({ email, role })
        setSuccess(true)
        setEmail('')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to send invite')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite member</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Invite team member</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && (
                <p className="text-sm text-green-600">Invite sent.</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={isPending || !email.trim()}
                >
                  {isPending ? 'Sending...' : 'Send invite'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
