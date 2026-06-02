import { redirect } from 'next/navigation'

/**
 * Uniform access-denied / not-found response for SIGNED-IN users inside the
 * app shell. Redirects to a safe home with a flag the dashboard reads to
 * show a toast. Used in place of notFound() on role-scoped content pages so
 * a role change never dead-ends the user in a 404. Uniform for "out of
 * scope" and "does not exist" so it does not leak which records exist.
 */
export function redirectAccessDenied(): never {
  redirect('/dashboard?denied=1')
}
