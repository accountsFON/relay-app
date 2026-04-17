import { completeOnboarding } from './actions'

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Welcome to Relay</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your name to finish setting up your account.
          </p>
        </div>

        <form action={completeOnboarding} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="displayName"
              className="text-sm font-medium text-slate-700"
            >
              Your name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              placeholder="e.g. Julio Aleman"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Get started
          </button>
        </form>
      </div>
    </div>
  )
}
