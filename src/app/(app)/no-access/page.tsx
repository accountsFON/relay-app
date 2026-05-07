import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NoAccessPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1
          className="text-2xl font-normal italic mb-3"
          style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px' }}
        >
          No access to this agency.
        </h1>
        <p className="text-muted-foreground mb-6">
          You are not a member of this agency. If you should have access,
          ask the agency admin to invite you.
        </p>
        <Link href="/sign-out">
          <Button variant="outline">Sign out</Button>
        </Link>
      </div>
    </div>
  )
}
