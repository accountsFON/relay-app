export default function PendingPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">Account pending</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your account has been created but access is still being configured. Contact Julio or
          Caleb to finish setup.
        </p>
      </div>
    </div>
  )
}
