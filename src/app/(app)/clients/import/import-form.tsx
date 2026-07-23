'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  importClientsCsv,
  analyzeClientsCsv,
  type ImportResult,
  type ImportAnalysis,
} from './actions'
import { CLIENT_IMPORT_FIELDS, type FieldMapping } from '@/lib/client-import-fields'

type Mode = 'single' | 'bulk'

export function ImportForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('bulk')
  const [csvText, setCsvText] = useState<string>('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setError(null)
    setAnalysis(null)
    setMapping({})
    const text = await file.text()
    setCsvText(text)

    setAnalyzing(true)
    try {
      const a = await analyzeClientsCsv(text)
      setAnalysis(a)
      if (a.ok) setMapping(a.suggested)
      else setError(a.error ?? 'Could not read this CSV.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this CSV.')
    } finally {
      setAnalyzing(false)
    }
  }

  const nameMapped = Boolean(mapping.name)

  const onSubmit = () => {
    setError(null)
    setResult(null)
    if (!csvText.trim()) {
      setError('Please choose a CSV file first.')
      return
    }
    if (!nameMapped) {
      setError('Map the "Name" field to one of your columns before importing.')
      return
    }
    startTransition(async () => {
      try {
        const r = await importClientsCsv({ csvText, mode, mapping })
        setResult(r)
        if (r.ok) {
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
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">CSV file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            disabled={isPending}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              Choose file
            </Button>
            <span className="text-sm text-muted-foreground">
              {fileName ?? 'No file chosen'}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Need a starting point?{' '}
          <a
            href="/clients/import/template.csv"
            download="clients-template.csv"
            className="underline hover:text-foreground"
          >
            Download the template CSV
          </a>
          . Any column names work, you map them below.
        </p>
      </Card>

      {analyzing && (
        <p className="text-sm text-muted-foreground">Reading columns...</p>
      )}

      {/* Column mapping */}
      {analysis?.ok && (
        <Card className="p-4">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Map your columns</h2>
            <span className="text-xs text-muted-foreground">
              Detected {analysis.rowCount} {analysis.rowCount === 1 ? 'row' : 'rows'} and{' '}
              {analysis.headers.length} columns
            </span>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Pick which of your CSV columns fills each field. We pre-filled the ones we
            recognized. Leave a field on{' '}
            <span className="font-medium">Ignore</span> to skip it.
          </p>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-100 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Your CSV column</th>
                </tr>
              </thead>
              <tbody>
                {CLIENT_IMPORT_FIELDS.map((f) => {
                  const unmappedRequired = f.required && !mapping[f.field]
                  return (
                    <tr key={f.field} className="border-t border-border">
                      <td className="px-3 py-2 align-middle">
                        {f.label}
                        {f.required && <span className="text-destructive"> *</span>}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <select
                          aria-label={`Column for ${f.label}`}
                          value={mapping[f.field] ?? ''}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [f.field]: e.target.value || null,
                            }))
                          }
                          className={`w-full max-w-xs rounded-md border bg-card px-2 py-1 text-sm ${
                            unmappedRequired ? 'border-destructive' : 'border-border'
                          }`}
                        >
                          <option value="">— Ignore —</option>
                          {analysis.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!nameMapped && (
            <p className="mt-3 text-xs text-destructive">
              Name is required. Map it to one of your columns to import.
            </p>
          )}
        </Card>
      )}

      {/* Preview / errors */}
      {result && (
        <Card className="p-4">
          {result.ok ? (
            <div>
              <p className="text-sm font-semibold text-emerald-700">
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
        <Button
          onClick={onSubmit}
          disabled={isPending || analyzing || !csvText.trim() || !nameMapped}
        >
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
