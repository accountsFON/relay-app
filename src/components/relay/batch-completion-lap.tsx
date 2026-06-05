/**
 * BatchCompletionLap: celebratory overlay shown the FIRST time a viewer
 * lands on a batch at the terminal `completed` step (after the final step is
 * finished). Avatars of the
 * AM, Designer, client, and current holder do one race-lap around a trophy,
 * then fade. Persists a per-batch localStorage flag so the celebration only
 * fires once per viewer per batch.
 */
'use client'

import { useEffect, useState } from 'react'
import { Trophy, UserCircle2, X } from 'lucide-react'

export interface CelebrationParticipant {
  id: string
  name: string
  avatarUrl: string | null
}

export interface BatchCompletionLapProps {
  batchId: string
  participants: CelebrationParticipant[]
}

const ANIMATION_MS = 6000

export function BatchCompletionLap({
  batchId,
  participants,
}: BatchCompletionLapProps) {
  const [show, setShow] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `celebrated:${batchId}`
    if (window.localStorage.getItem(key)) return
    window.localStorage.setItem(key, '1')
    setShow(true)
    const fadeTimer = setTimeout(() => setFading(true), ANIMATION_MS - 800)
    const hideTimer = setTimeout(() => setShow(false), ANIMATION_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [batchId])

  if (!show || participants.length === 0) return null

  const radius = participants.length <= 2 ? 90 : 120

  return (
    <div
      role="dialog"
      aria-label="Relay complete celebration"
      data-component="batch-completion-lap"
      className={
        'fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm transition-opacity duration-700 ' +
        (fading ? 'opacity-0' : 'opacity-100')
      }
      onClick={() => setShow(false)}
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute top-6 right-6 rounded-full bg-background/90 p-2 text-foreground hover:bg-background"
        onClick={(e) => {
          e.stopPropagation()
          setShow(false)
        }}
      >
        <X className="size-4" />
      </button>

      <div className="relative" style={{ width: `${radius * 2 + 96}px`, height: `${radius * 2 + 96}px` }}>
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2 text-foreground">
            <Trophy className="size-12 text-foreground" />
            <p className="text-lg font-semibold">Relay complete!</p>
            <p className="text-[13px] text-muted-foreground">
              {participants.length === 1
                ? 'Solid lap.'
                : `Thanks to the ${participants.length} of you who carried this one across the line.`}
            </p>
          </div>
        </div>

        {participants.map((p, i) => (
          <div
            key={p.id}
            className="batch-lap-orbit"
            style={{
              animationDelay: `${(-ANIMATION_MS * (i / participants.length)) / 1000}s`,
            }}
          >
            <div
              className="batch-lap-anchor"
              style={{
                left: `${radius}px`,
                animationDelay: `${(-ANIMATION_MS * (i / participants.length)) / 1000}s`,
              }}
            >
              <Avatar participant={p} />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .batch-lap-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          animation: batch-lap-orbit ${ANIMATION_MS}ms linear forwards;
        }
        .batch-lap-anchor {
          position: absolute;
          top: -24px;
          animation: batch-lap-counter ${ANIMATION_MS}ms linear forwards;
        }
        @keyframes batch-lap-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes batch-lap-counter {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  )
}

function Avatar({ participant }: { participant: CelebrationParticipant }) {
  if (participant.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={participant.avatarUrl}
        alt={participant.name}
        title={participant.name}
        className="size-12 rounded-full border-2 border-background shadow-md object-cover"
      />
    )
  }
  return (
    <div
      title={participant.name}
      className="flex size-12 items-center justify-center rounded-full border-2 border-background bg-neutral-100 text-muted-foreground shadow-md"
    >
      <UserCircle2 className="size-7" />
    </div>
  )
}
