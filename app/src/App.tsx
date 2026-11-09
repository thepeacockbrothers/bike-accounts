import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getApiKey } from './lib/settings'
import type { CategoryId } from './lib/categories'
import { learnRules, payeeKey, sameBankPaymentKey, toTxns } from './lib/categorise'
import { isCoconutExport, parseCoconut } from './lib/coconut'
import { parseStatement } from './lib/csv'
import { findMatch, flagDuplicates } from './lib/duplicates'
import { store, supabase } from './lib/store'
import { currentTaxYear, taxYearOf } from './lib/taxYear'
import { needsChecking, type Rule, type Txn } from './lib/types'
import { CheckIcon, HomeIcon, PlusIcon, TaxIcon, UploadIcon } from './screens/icons'
import Home from './screens/Home'
import Upload, { type ImportResult } from './screens/Upload'
import Check from './screens/Check'
import TaxReturn from './screens/TaxReturn'
import Settings from './screens/Settings'
import Login from './screens/Login'
import Add, { type NewEntry } from './screens/Add'

export type Tab = 'home' | 'upload' | 'check' | 'tax' | 'settings'


export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [txns, setTxns] = useState<Txn[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('home')
  const [year, setYear] = useState(currentTaxYear())
  const [adding, setAdding] = useState(false)
  const importedIds = useRef(new Map<string, string[]>())
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const signedIn = !supabase || !!session

  const reload = useCallback(async () => {
    try {
      const data = await store.load()
      setTxns(data.txns)
      setRules(data.rules)
      setLoaded(true)
    } catch (e) {
      setError(`Couldn't load your data: ${(e as Error).message}`)
    }
  }, [])

  // Early in a new tax year there's nothing to show yet, so open on the latest year that has payments.
  useEffect(() => {
    if (txns.length && !txns.some((t) => taxYearOf(t.date) === year)) {
      setYear(Math.max(...txns.map((t) => taxYearOf(t.date))))
    }
  }, [txns, year])

  useEffect(() => {
    if (signedIn) reload()
  }, [signedIn, reload])

  // Pick up changes made on the other device when he comes back to the app.
  useEffect(() => {
    if (!store.synced) return
    const onFocus = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [reload])

  const years = useMemo(() => {
    const set = new Set([currentTaxYear(), ...txns.map((t) => taxYearOf(t.date))])
    return [...set].sort((a, b) => b - a)
  }, [txns])

  /** Drops payments already in the app: same id, or the same bank payment worded differently. */
  function onlyNew(incoming: Txn[]) {
    const ids = new Set(txns.map((t) => t.id))
    const seen = new Map<string, number>()
    for (const t of txns) {
      if (t.importId === 'manual') continue
      const k = sameBankPaymentKey(t)
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    return incoming.filter((t) => {
      const k = sameBankPaymentKey(t)
      const left = seen.get(k) ?? 0
      if (ids.has(t.id) || (t.importId !== 'manual' && left > 0)) {
        seen.set(k, left - 1)
        return false
      }
      return true
    })
  }

  async function importFile(file: File): Promise<ImportResult> {
    const text = await file.text()
    return isCoconutExport(text) ? importCoconut(text) : importStatement(text)
  }

  async function importStatement(text: string): Promise<ImportResult> {
    const raw = parseStatement(text)
    const importId = `${Date.now()}`
    const incoming = toTxns(raw, rules, importId)
    const fresh = onlyNew(incoming)

    let aiCount = 0
    let aiError = ''
    const unknown = fresh.filter((t) => t.category === null)
    if (unknown.length && getApiKey()) {
      try {
        const { aiCategorise } = await import('./lib/ai')
        const guesses = await aiCategorise(unknown)
        for (const t of fresh) {
          const g = guesses.get(t.id)
          if (g) Object.assign(t, { category: g, source: 'ai' })
        }
        aiCount = guesses.size
      } catch (e) {
        aiError = (e as Error).message
      }
    }

    return save(importId, flagDuplicates(fresh, txns), incoming.length, raw.map((r) => r.date), { aiCount, aiError })
  }

  async function importCoconut(text: string): Promise<ImportResult> {
    const rows = parseCoconut(text)
    const importId = `${Date.now()}`
    // Bank rows and his cash entries are numbered separately, matching how each would be added on its own.
    const bank = rows.filter((r) => !r.manual)
    const cash = rows.filter((r) => r.manual)
    const withCategories = (list: typeof rows, id: string) =>
      toTxns(list, [], id).map((t, i) => ({
        ...t,
        category: list[i].category,
        source: list[i].category ? ('manual' as const) : null,
      }))
    const incoming = [...withCategories(bank, importId), ...withCategories(cash, 'manual')]
    const fresh = onlyNew(incoming)

    // His years of choices in Coconut become "always put this payee in X" for future statements.
    const learned = learnRules([...txns, ...fresh]).filter((r) => !rules.some((own) => own.pattern === r.pattern))
    await store.saveRules(learned)
    setRules((prev) => [...prev, ...learned])

    return save(importId, fresh, incoming.length, rows.map((r) => r.date), { learned: learned.length, fromCoconut: true })
  }

  async function save(importId: string, fresh: Txn[], incomingCount: number, dates: string[], extra: Partial<ImportResult>) {
    await store.saveTxns(fresh)
    setTxns((prev) => [...prev, ...fresh])
    importedIds.current.set(importId, fresh.map((t) => t.id))
    dates.sort()
    return {
      importId,
      added: fresh.length,
      duplicates: incomingCount - fresh.length,
      toCheck: fresh.filter(needsChecking).length,
      possibleRepeats: fresh.filter((t) => t.duplicateOf).length,
      aiCount: 0,
      aiError: '',
      learned: 0,
      fromCoconut: false,
      from: dates[0],
      to: dates[dates.length - 1],
      ...extra,
    }
  }

  async function undoImport(importId: string) {
    const ids = new Set(importedIds.current.get(importId) ?? txns.filter((t) => t.importId === importId).map((t) => t.id))
    await store.deleteTxns([...ids])
    setTxns((prev) => prev.filter((t) => !ids.has(t.id)))
  }

  /** Sets a category; if `remember`, applies it to every other unchecked transaction from the same payee too. */
  async function setCategory(txn: Txn, category: CategoryId, remember: boolean) {
    const changed: Txn[] = [{ ...txn, category, source: 'manual' }]
    const pattern = payeeKey(txn.description)
    if (remember && pattern) {
      const rule = { pattern, category }
      await store.saveRule(rule)
      setRules((prev) => [...prev.filter((r) => r.pattern !== pattern), rule])
      for (const t of txns) {
        if (t.id !== txn.id && t.source !== 'manual' && payeeKey(t.description) === pattern) {
          changed.push({ ...t, category, source: 'learned' })
        }
      }
    }
    await store.saveTxns(changed)
    const byId = new Map(changed.map((t) => [t.id, t]))
    setTxns((prev) => prev.map((t) => byId.get(t.id) ?? t))
    return changed.length - 1
  }

  async function addEntry(e: NewEntry) {
    const txn: Txn = {
      ...e,
      id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      source: 'manual',
      importId: 'manual',
    }
    await store.saveTxns([txn])
    setTxns((prev) => [...prev, txn])
    setYear(taxYearOf(txn.date))
    setAdding(false)
    setToast(`${txn.amount > 0 ? 'Income' : 'Expense'} saved`)
    setTimeout(() => setToast(''), 2500)
  }

  async function deleteEntry(txn: Txn) {
    // Anything flagged as a repeat of this entry no longer has anything to repeat.
    const unflagged = txns.filter((t) => t.duplicateOf === txn.id).map((t) => ({ ...t, duplicateOf: undefined }))
    await store.deleteTxns([txn.id])
    if (unflagged.length) await store.saveTxns(unflagged)
    const byId = new Map(unflagged.map((t) => [t.id, t]))
    setTxns((prev) => prev.filter((t) => t.id !== txn.id).map((t) => byId.get(t.id) ?? t))
  }

  /**
   * "Same payment": keep one, preferring the bank's record (that's what the accountant can match to
   * the statement) but with the category he chose by hand. "Different": keep both and stop asking.
   */
  async function resolveDuplicate(txn: Txn, same: boolean) {
    const other = txns.find((t) => t.id === txn.duplicateOf)
    if (!same || !other) {
      const kept = { ...txn, duplicateOf: undefined }
      await store.saveTxns([kept])
      setTxns((prev) => prev.map((t) => (t.id === txn.id ? kept : t)))
      return
    }
    const [keep, drop] = txn.importId === 'manual' && other.importId !== 'manual' ? [other, txn] : [txn, other]
    const handChosen = [drop, keep].find((t) => t.importId === 'manual' && t.category)
    const kept: Txn = {
      ...keep,
      duplicateOf: undefined,
      ...(handChosen ? { category: handChosen.category, source: 'manual' as const } : {}),
    }
    await store.saveTxns([kept])
    await store.deleteTxns([drop.id])
    setTxns((prev) => prev.filter((t) => t.id !== drop.id).map((t) => (t.id === kept.id ? kept : t)))
  }

  const toCheck = txns.filter((t) => taxYearOf(t.date) === year && needsChecking(t)).length

  if (!authReady) return <div className="empty">Loading…</div>
  if (!signedIn) return <Login />

  return (
    <div className="app">
      <main>
        {error && <div className="note error">{error}</div>}
        {!loaded && !error && <div className="empty">Loading…</div>}
        {loaded && tab === 'home' && <Home txns={txns} year={year} years={years} setYear={setYear} go={setTab} />}
        {loaded && tab === 'upload' && <Upload importFile={importFile} undoImport={undoImport} go={setTab} />}
        {loaded && tab === 'check' && <Check txns={txns} year={year} setCategory={setCategory} deleteEntry={deleteEntry} resolveDuplicate={resolveDuplicate} />}
        {loaded && tab === 'tax' && <TaxReturn txns={txns} year={year} years={years} setYear={setYear} />}
        {loaded && tab === 'settings' && <Settings txnCount={txns.length} />}
      </main>
      <nav className="tabs">
        {(
          [
            ['home', 'Home', HomeIcon],
            ['upload', 'Upload', UploadIcon],
            ['add', 'Add', PlusIcon],
            ['check', 'Check', CheckIcon],
            ['tax', 'Tax return', TaxIcon],
          ] as const
        ).map(([id, label, Icon]) =>
          id === 'add' ? (
            <button key={id} className="add-button" disabled={!loaded} aria-label="Add income or expense" onClick={() => setAdding(true)}>
              <span className="add-disc">
                <Icon />
              </span>
              {label}
            </button>
          ) : (
            <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <span className="tab-icon">
                <Icon />
                {id === 'check' && toCheck > 0 && <span className="badge">{toCheck}</span>}
              </span>
              {label}
            </button>
          ),
        )}
      </nav>
      {adding && <Add onSave={addEntry} findRepeat={(e) => findMatch({ ...e, importId: 'manual' }, txns)} onClose={() => setAdding(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
