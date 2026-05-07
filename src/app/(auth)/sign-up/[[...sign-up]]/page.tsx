import Image from 'next/image'
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Image
        src="/brand/logo-no-padding-dark-text.svg"
        alt="Relay"
        width={120}
        height={36}
        priority
        className="h-9 w-auto mb-10"
      />
      <SignUp
        appearance={{
          elements: {
            card: 'shadow-none bg-card rounded-2xl',
            headerTitle: 'font-bold text-foreground',
            formButtonPrimary: 'bg-primary hover:bg-ink-80 rounded-full',
            footerActionLink: 'text-foreground hover:text-ink-80',
          },
        }}
      />
    </div>
  )
}
