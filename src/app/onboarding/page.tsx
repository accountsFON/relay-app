import { completeOnboarding } from './actions'

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Welcome to Relay</h1>
          <p className="mt-2 text-sm text-slate-500">
            Set up your account to get started.
          </p>
        </div>

        <form action={completeOnboarding} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="orgName"
              className="text-sm font-medium text-slate-700"
            >
              Organization name
            </label>
            <input
              id="orgName"
              name="orgName"
              type="text"
              required
              placeholder="Your agency or business name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Plan
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative flex cursor-pointer rounded-lg border border-slate-200 p-4 hover:border-slate-900">
                <input
                  type="radio"
                  name="plan"
                  value="smb"
                  className="sr-only"
                  defaultChecked
                />
                <div>
                  <p className="font-medium text-slate-900">Starter</p>
                  <p className="text-xs text-slate-500">$29/mo · 1 brand</p>
                </div>
              </label>
              <label className="relative flex cursor-pointer rounded-lg border border-slate-200 p-4 hover:border-slate-900">
                <input
                  type="radio"
                  name="plan"
                  value="agency"
                  className="sr-only"
                />
                <div>
                  <p className="font-medium text-slate-900">Growth</p>
                  <p className="text-xs text-slate-500">$99/mo · 10 clients</p>
                </div>
              </label>
            </div>
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
