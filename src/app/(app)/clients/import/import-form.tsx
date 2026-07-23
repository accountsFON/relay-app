'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  importClientsCsv,
  previewImportClientsCsv,
  analyzeClientsCsv,
  type ImportResult,
  type ImportAnalysis,
} from './actions'
import type { ImportPlan } from '@/server/csv/matchClients'
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
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Any change to the source/mapping invalidates a computed plan.
  const resetPlan = () => {
    setPlan(null)
    setResult(null)
    setError(null)
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setAnalysis(null)
    setMapping({})
    resetPlan()
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

  const onPreview = () => {
    setError(null)
    setResult(null)
    if (!csvText.trim()) {
      setError('Please choose a CSV file first.')
      return
    }
    if (!nameMapped) {
      setError('Map the "Name" field to one of your columns first.')
      return
    }
    setPreviewing(true)
    ;(async () => {
      try {
        const p = await previewImportClientsCsv({ csvText, mode, mapping })
        if (p.error) {
          setError(p.error)
          setPlan(null)
        } else {
          setPlan(p.plan ?? null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Preview failed')
      } finally {
        setPreviewing(false)
      }
    })()
  }

  const onConfirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        const r = await importClientsCsv({ csvText, mode, mapping })
        setResult(r)
        if (r.ok) {
          setTimeout(() => router.push('/clients'), 1400)
        } else if (r.plan) {
          setPlan(r.plan)
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
          onClick={() => {
            setMode('single')
            resetPlan()
          }}
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
          onClick={() => {
            setMode('bulk')
            resetPlan()
          }}
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
          ? 'Upload a CSV with exactly one data row.'
          : 'Upload a CSV with as many rows as you want.'}{' '}
        Rows that match an existing client (by phone or website) update it; the rest create new
        clients. All or nothing: if any row has an error, nothing is written.
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

      {analyzing && <p className="text-sm text-muted-foreground">Reading columns...</p>}

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
            Pick which of your CSV columns fills each field. We pre-filled the ones we recognized.
            Leave a field on <span className="font-medium">Ignore</span> to skip it.
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
                          onChange={(e) => {
                            setMapping((m) => ({ ...m, [f.field]: e.target.value || null }))
                            resetPlan()
                          }}
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
              Name is required. Map it to one of your columns to continue.
            </p>
          )}
        </Card>
      )}

      {/* Preview (create vs update plan) */}
      {plan && !result?.ok && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Preview</h2>
            <span className="text-xs text-muted-foreground">
              {plan.newCount} new · {plan.updateCount} will update existing
              {plan.errorCount > 0 ? ` · ${plan.errorCount} with errors` : ''}
            </span>
          </div>
          {plan.errorCount > 0 && (
            <p className="mb-3 text-xs text-destructive">
              Fix the {plan.errorCount} row {plan.errorCount === 1 ? 'error' : 'errors'} below before
              importing. Nothing is written until every row is clear.
            </p>
          )}
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-100 text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr
                    key={r.rowIndex}
                    className={`border-t border-border ${r.ok ? '' : 'bg-destructive/5'}`}
                  >
                    <td className="px-3 py-2 align-top">{r.rowIndex}</td>
                    <td className="px-3 py-2 align-top">
                      {!r.ok ? (
                        <span className="text-destructive">Error</span>
                      ) : r.action === 'update' ? (
                        <span className="text-amber-700">
                          Update → {r.matchedClientName}
                        </span>
                      ) : (
                        <span className="text-emerald-700">New</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">{r.name}</td>
                    <td className="px-3 py-2 align-top text-destructive">
                      {r.errors.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Final result */}
      {result?.ok && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-emerald-700">
            Imported: created {result.createdCount}, updated {result.updatedCount}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Redirecting to client list...</p>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {!plan ? (
          <Button
            onClick={onPreview}
            disabled={previewing || analyzing || !csvText.trim() || !nameMapped}
          >
            {previewing ? 'Checking...' : 'Preview import'}
          </Button>
        ) : (
          !result?.ok && (
            <>
              <Button variant="outline" onClick={resetPlan} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={isPending || !plan.ok}>
                {isPending
                  ? 'Importing...'
                  : `Confirm: ${plan.newCount} new, ${plan.updateCount} update`}
              </Button>
            </>
          )
        )}
      </div>
    </div>
  )
}
