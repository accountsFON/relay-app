'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { importClientsCsv, type ImportResult } from './actions'

type Mode = 'single' | 'bulk'

export function ImportForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('bulk')
  const [csvText, setCsvText] = useState<string>('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setError(null)
    const text = await file.text()
    setCsvText(text)
  }

  const onSubmit = () => {
    setError(null)
    setResult(null)
    if (!csvText.trim()) {
      setError('Please choose a CSV file first.')
      return
    }
    startTransition(async () => {
      try {
        const r = await importClientsCsv({ csvText, mode })
        setResult(r)
        if (r.ok) {
          // Brief success message before redirect
          setTimeout(() => router.push('/clients'), 1200)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Mode tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            mode === 'single'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Single client
        </button>
        <button
          type="button"
          onClick={() => setMode('bulk')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            mode === 'bulk'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Bulk import
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        {mode === 'single'
          ? 'Upload a CSV with exactly one data row to create one client.'
          : 'Upload a CSV with as many rows as you want. The import is all or nothing: if any row fails validation, no clients are created.'}
      </p>

      {/* File picker */}
      <Card className="p-4">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            disabled={isPending}
            className="text-sm"
          />
          {fileName && (
            <span className="text-xs text-muted-foreground">
              Selected: {fileName}
            </span>
          )}
        </label>
        <p className="text-xs text-muted-foreground mt-3">
          Need a starting point?{' '}
          <a
            href="/clients/import/template.csv"
            download="clients-template.csv"
            className="underline hover:text-foreground"
          >
            Download the template CSV
          </a>
          .
        </p>
      </Card>

      {/* Preview / errors */}
      {result && (
        <Card className="p-4">
          {result.ok ? (
            <div>
              <p className="text-sm font-semibold text-green-700">
                Imported {result.createdCount}{' '}
                {result.createdCount === 1 ? 'client' : 'clients'}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Redirecting to client list...
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-destructive">
                {result.error ?? 'Import failed.'}
              </p>
              {result.rows.length > 0 && (
                <div className="mt-3 max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-left uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-1">Row</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr
                          key={r.rowIndex}
                          className={`border-b border-border ${
                            r.ok ? '' : 'bg-destructive/5'
                          }`}
                        >
                          <td className="px-2 py-1 align-top">{r.rowIndex}</td>
                          <td className="px-2 py-1 align-top">
                            {r.ok ? '✓ ok' : '✗ error'}
                          </td>
                          <td className="px-2 py-1 align-top">
                            {r.data?.name ?? ''}
                          </td>
                          <td className="px-2 py-1 align-top text-destructive">
                            {r.errors.join('; ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={isPending || !csvText.trim()}>
          {isPending
            ? 'Importing...'
            : mode === 'single'
              ? 'Import client'
              : 'Import clients'}
        </Button>
      </div>
    </div>
  )
}
