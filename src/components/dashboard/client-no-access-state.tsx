import { Card } from '@/components/ui/card'

/**
 * Shown when a `client`-role user has no linked client. Without a link the
 * client can load no clients and would otherwise fall through to the
 * agency-internal cost view, so this surfaces a clear, friendly dead end
 * instead. The repo-level guard now blocks creating this state, but accounts
 * predating the guard can still land here.
 */
export function ClientNoAccessState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <Card className="max-w-md text-center">
        <div className="px-8 py-10">
          <h2
            className="text-2xl font-normal italic text-foreground"
            style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px' }}
          >
            No client linked yet
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed">
            Your account is not linked to a client workspace yet. Reach out to
            your account manager to get set up.
          </p>
        </div>
      </Card>
    </div>
  )
}
