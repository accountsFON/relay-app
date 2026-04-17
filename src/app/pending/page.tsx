export default function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Account pending</h1>
        <p className="mt-3 text-sm text-slate-600">
          Your account has been created but access is still being configured. Contact Julio or
          Caleb to finish setup.
        </p>
      </div>
    </div>
  )
}
