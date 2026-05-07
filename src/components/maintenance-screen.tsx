export function MaintenanceScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1
          className="text-2xl font-normal italic"
          style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px' }}
        >
          Upgrading Relay.
        </h1>
        <p className="mt-3 text-muted-foreground">
          We will be back in a minute. Hang tight.
        </p>
      </div>
    </div>
  )
}
