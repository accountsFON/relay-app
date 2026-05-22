import Image from 'next/image'
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Image
        src="/brand/wordmark-dark.svg"
        alt="Relay"
        width={72}
        height={36}
        priority
        className="h-9 w-auto mb-10"
      />
      <SignIn
        appearance={{
          elements: {
            card: 'shadow-none bg-card rounded-2xl',
            headerTitle: 'font-bold text-foreground',
            formButtonPrimary: 'bg-primary hover:bg-neutral-700 rounded-full',
            footerActionLink: 'text-foreground hover:text-neutral-700',
          },
        }}
      />
    </div>
  )
}
