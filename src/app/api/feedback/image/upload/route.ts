import { NextResponse, type NextRequest } from 'next/server'
import { requireOrgContext } from '@/server/middleware/auth'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import {
  FEEDBACK_IMAGE_PREFIX,
  FEEDBACK_IMAGE_UPLOAD_TOKEN_OPTIONS,
} from '@/lib/feedback-image'

/**
 * POST /api/feedback/image/upload
 *
 * SDK mode (@vercel/blob/client.upload). Any signed-in user may attach a
 * screenshot to a bug report, but ONLY under the `feedback-images/` prefix,
 * enforced server-side in onBeforeGenerateToken regardless of the
 * client-chosen pathname. Anonymous callers are rejected by requireOrgContext.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  await requireOrgContext()

  const json = await handleUpload({
    body: body as HandleUploadBody,
    request: req,
    onBeforeGenerateToken: async (pathname: string) => {
      if (!pathname.startsWith(`${FEEDBACK_IMAGE_PREFIX}/`)) {
        throw new Error('Forbidden: pathname outside feedback-images prefix')
      }
      return FEEDBACK_IMAGE_UPLOAD_TOKEN_OPTIONS
    },
    onUploadCompleted: async () => {
      // No-op: the browser POSTs the resulting URL as part of
      // submitFeedbackAction, which validates + persists it.
    },
  })
  return NextResponse.json(json)
}
