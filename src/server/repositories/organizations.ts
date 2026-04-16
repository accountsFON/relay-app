import { db } from '@/db/client'
import type { Plan } from '@/lib/types'

export async function findOrgByClerkId(clerkOrgId: string) {
  return db.organization.findUnique({
    where: { clerkOrgId },
  })
}

export async function createOrganization(input: {
  clerkOrgId: string
  name: string
  plan: Plan
}) {
  return db.organization.create({
    data: {
      clerkOrgId: input.clerkOrgId,
      name: input.name,
      plan: input.plan,
    },
  })
}
