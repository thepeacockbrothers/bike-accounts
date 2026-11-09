import { useRef, useState } from 'react'
import type { Tab } from '../App'
import { StatementError } from '../lib/csv'

export interface ImportResult {
  importId: string
  added: number
  duplicates: number
  toCheck: number
  possibleRepeats: number
  learned: number
  fromCoconut: boolean
  aiCount: number
  aiError: string
  from: string
  to: string
}

interface Props {
  importFile: (f: File) => Promise<ImportResult>
  undoImport: (importId: string) => Promise<void>
  go: (t: Tab) => void
}

const ukDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Upload({ importFile, undoImport, go }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await importFile(file))
    } catch (e) {
      setError(e instanceof StatementError ? e.message : `Something went wrong: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function undo() {
    if (!result) return
    setBusy(true)
    await undoImport(result.importId)
    setResult(null)
    setBusy(false)
  }

  return (
    <section>
      <h1>Upload a bank statement</h1>

      {!result && (
        <>
          <ol className="steps">
            <li>Log in to online banking on a computer or the bank's website.</li>
            <li>
              Find the business account, choose <b>Export</b> or <b>Download transactions</b>, and pick <b>CSV</b>{' '}
              (sometimes called "Excel" or "spreadsheet").
            </li>
            <li>Choose the dates. Last month is fine, and any payments already uploaded are skipped.</li>
          </ol>
          <p className="hint">Moving from Coconut? Upload its "Combined View" export here and your history comes across.</p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,.txt"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button className="primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Reading statement…' : 'Choose statement file'}
          </button>
        </>
      )}

      {error && <div className="note error">{error}</div>}

      {result && (
        <div className="result">
          <h2 className="result-title">{result.added === 0 ? 'Already uploaded' : result.fromCoconut ? 'Coconut history added' : 'Statement added'}</h2>
          <p>
            <b>{result.added}</b> new payments from {ukDate(result.from)} to {ukDate(result.to)}.
            {result.duplicates > 0 && <> {result.duplicates} were already in, so skipped.</>}
          </p>
          {result.fromCoconut && (
            <p>
              Brought in from Coconut with the categories you'd already chosen.
              {result.learned > 0 && ` The app learned ${result.learned} payees, so future statements sort themselves.`}
            </p>
          )}
          {result.possibleRepeats > 0 && (
            <p>
              {result.possibleRepeats === 1
                ? '1 of them looks like a payment you already added by hand.'
                : `${result.possibleRepeats} of them look like payments you already added by hand.`}{' '}
              Check them so nothing is counted twice.
            </p>
          )}
          {result.aiCount > 0 && <p className="hint">Claude suggested categories for {result.aiCount} of them.</p>}
          {result.aiError && <p className="hint">Couldn't reach Claude for suggestions ({result.aiError}).</p>}
          {result.toCheck > 0 ? (
            <button className="primary" onClick={() => go('check')}>
              Check {result.toCheck} {result.toCheck === 1 ? 'payment' : 'payments'}
            </button>
          ) : (
            <button className="primary" onClick={() => go('home')}>
              Back to home
            </button>
          )}
          <button className="secondary" onClick={() => setResult(null)}>
            Upload another
          </button>
          <button className="link" disabled={busy} onClick={undo}>
            Wrong file? Undo this upload
          </button>
        </div>
      )}
    </section>
  )
}
