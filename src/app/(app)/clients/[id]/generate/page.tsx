import { redirect } from 'next/navigation'

/**
 * Legacy /generate route. Replaced by the GenerateContentDialog modal
 * mounted on the batch page header.
 *
 * Per spec § Section A routing table.
 */
export default async function GenerateRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/clients/${id}`)
}
