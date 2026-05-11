'use client'

import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface ErrorContext {
  name?: string
  message?: string
  stack?: string | null
  capturedAt?: string
}

export interface FailedRunBannerProps {
  errorMessage: string | null
  errorContext: ErrorContext | null
  failedStep: string
  pipelineDurationSeconds: number | null
  reRunHref: string
  partialPostCount: number
}

export function FailedRunBanner({
  errorMessage,
  errorContext,
  failedStep,
  pipelineDurationSeconds,
  reRunHref,
  partialPostCount,
}: FailedRunBannerProps) {
  const [stackOpen, setStackOpen] = useState(false)
  const message = errorMessage ?? errorContext?.message ?? 'No error message captured.'
  const stack = errorContext?.stack ?? null
  const errorName = errorContext?.name ?? null
  const captured = errorContext?.capturedAt
    ? new Date(errorContext.capturedAt).toLocaleString()
    : null

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5">
      <div className="flex items-start gap-3 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              Run failed during {failedStep}
            </h2>
            <p className="mt-1 text-[13px] text-foreground/80 break-words">
              {message}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {errorName && <span className="font-mono">{errorName}</span>}
            {captured && <span>captured {captured}</span>}
            {pipelineDurationSeconds !== null && (
              <span>{pipelineDurationSeconds}s before failure</span>
            )}
            {partialPostCount > 0 && (
              <span className="text-foreground/80">
                {partialPostCount} partial post{partialPostCount === 1 ? '' : 's'} persisted below
              </span>
            )}
          </div>

          {stack && (
            <button
              type="button"
              onClick={() => setStackOpen((v) => !v)}
              className="flex items-center gap-1 text-[12px] font-medium text-foreground/80 hover:text-foreground"
              aria-expanded={stackOpen}
            >
              {stackOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {stackOpen ? 'Hide stack' : 'Show stack'}
            </button>
          )}

          {stack && stackOpen && (
            <pre className="max-h-72 overflow-auto rounded-md border border-destructive/20 bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
              {stack}
            </pre>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Link
              href={reRunHref}
              className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90"
            >
              Re-run this month
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
