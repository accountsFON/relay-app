import Image from 'next/image'

export default function PendingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <Image
        src="/brand/wordmark-dark.svg"
        alt="Relay"
        width={72}
        height={36}
        priority
        className="h-9 w-auto mb-10"
      />
      <div className="w-full max-w-md rounded-2xl bg-card p-8 sm:p-10 text-center">
        <h1
          className="text-2xl font-normal italic text-foreground"
          style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px', lineHeight: 1.15 }}
        >
          Hang tight.
        </h1>
        <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed">
          Your account exists but access is still being configured. Ping Julio or Caleb
          to finish the setup.
        </p>
      </div>
    </div>
  )
}
