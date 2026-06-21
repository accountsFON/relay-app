'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SendLinkModal } from './send-link-modal'

interface Props {
  batchId: string
  clientName: string
  clientReviewEmail?: string | null
}

/**
 * SendLinkButton: opens a modal that mints + emails a magic review link.
 *
 * Internal AM use only. The host page should only render this for users
 * with client.edit permission.
 */
export function SendLinkButton({ batchId, clientName, clientReviewEmail }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="send-link-button"
      >
        <Send className="size-3.5 shrink-0" />
        <span>Send review link</span>
      </Button>

      <SendLinkModal
        batchId={batchId}
        clientName={clientName}
        clientReviewEmail={clientReviewEmail}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
