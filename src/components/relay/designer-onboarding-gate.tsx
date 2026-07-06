'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import type { Client } from '@prisma/client'
import { Check, ExternalLink, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ClientProfileView } from '@/components/clients/client-profile-view'
import { resolveCanvaUrl } from '@/lib/canva'
import { acknowledgeDesignerGateAction } from '@/server/actions/designerGateAck'
import { cn } from '@/lib/utils'

/**
 * DesignerOnboardingGate (P0): when a designer opens a relay, this renders
 * instead of the workspace. A two-item review checklist over a skeleton
 * backdrop:
 *   1. Review client profile → opens the read-only ClientProfileView in a modal.
 *   2. Review brand guide → opens the client's Canva folder in a new tab.
 *
 * Click-to-review: opening a resource marks that row done (no separate
 * checkbox). When both are done, "Enter workspace" enables and calls
 * acknowledgeDesignerGateAction(batchId).
 *
 * Note: the Dialog/Button primitives here are @base-ui/react, which compose via
 * a `render` prop (not Radix's `asChild`).
 */
export function DesignerOnboardingGate({
  client,
  batchId,
}: {
  client: Client
  batchId: string
}) {
  const [profileSeen, setProfileSeen] = useState(false)
  const [brandSeen, setBrandSeen] = useState(false)
  const [pending, startTransition] = useTransition()
  const canEnter = profileSeen && brandSeen
  const brandGuideUrl = resolveCanvaUrl(client.canvaUrl)

  function enter() {
    startTransition(async () => {
      await acknowledgeDesignerGateAction(batchId)
    })
  }

  return (
    <div className="relative min-h-[60vh]">
      <div aria-hidden className="space-y-4 opacity-60">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
          <h2 className="text-lg font-semibold">
            Before you design {client.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Take a moment to review the brand context, then enter the workspace.
          </p>

          <ul className="mt-5 space-y-3">
            <GateRow done={profileSeen}>
              <Dialog
                onOpenChange={(open) => {
                  if (open) setProfileSeen(true)
                }}
              >
                <DialogTrigger
                  render={<Button variant="outline" size="sm" className="gap-2" />}
                >
                  <FileText className="size-4" /> Review client profile
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{client.name} profile</DialogTitle>
                  </DialogHeader>
                  <ClientProfileView client={client} />
                </DialogContent>
              </Dialog>
            </GateRow>

            <GateRow done={brandSeen}>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                render={
                  <a
                    href={brandGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setBrandSeen(true)}
                  />
                }
              >
                <ExternalLink className="size-4" /> Open brand guide
              </Button>
            </GateRow>
          </ul>

          <Button
            className="mt-6 w-full"
            disabled={!canEnter || pending}
            onClick={enter}
          >
            {pending ? 'Opening…' : 'Enter workspace'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function GateRow({
  done,
  children,
}: {
  done: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-5 items-center justify-center rounded-full border',
          done
            ? 'border-transparent bg-primary text-primary-foreground'
            : 'border-muted-foreground/40',
        )}
        aria-hidden
      >
        {done && <Check className="size-3.5" />}
      </span>
      {children}
    </li>
  )
}
