import { db } from '@/db/client'
import type { ClientStatus } from '@/lib/types'

export async function findClientById(id: string, organizationId: string) {
  return db.client.findFirst({
    where: { id, organizationId },
  })
}

export async function listClientsByOrg(
  organizationId: string,
  filters?: { status?: ClientStatus }
) {
  return db.client.findMany({
    where: {
      organizationId,
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { name: 'asc' },
  })
}

type CreateClientInput = {
  organizationId: string
  name: string
  businessSummary?: string
  brandVoice?: string
  industry?: string
  location?: string
  phone?: string
  mainCta?: string
  focus1?: string
  focus2?: string
  focus3?: string
  dos?: string
  donts?: string
  postingDays: string
  postLength?: string
  urls: string[]
  targetAudience?: string
  holidayHandling: string
  excludedDates: string[]
  assetsFolderUrl?: string
  autoCrawl?: string
  assignedAmId?: string
  status: ClientStatus
}

export async function createClient(input: CreateClientInput) {
  return db.client.create({ data: input })
}

type UpdateClientData = Partial<{
  name: string
  businessSummary: string
  brandVoice: string
  industry: string
  location: string
  phone: string
  mainCta: string
  focus1: string
  focus2: string
  focus3: string
  dos: string
  donts: string
  postingDays: string
  postLength: string
  urls: string[]
  targetAudience: string
  holidayHandling: string
  excludedDates: string[]
  assetsFolderUrl: string
  autoCrawl: string
  assignedAmId: string
  status: ClientStatus
}>

export async function updateClient(
  id: string,
  organizationId: string,
  data: UpdateClientData
) {
  return db.client.updateMany({
    where: { id, organizationId },
    data,
  })
}

export async function archiveClient(id: string, organizationId: string) {
  return db.client.updateMany({
    where: { id, organizationId },
    data: { status: 'archived' },
  })
}
