import { CLIENT_CSV_TEMPLATE } from '@/server/csv/parseClientsCsv'

export async function GET() {
  return new Response(CLIENT_CSV_TEMPLATE, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="clients-template.csv"',
    },
  })
}
