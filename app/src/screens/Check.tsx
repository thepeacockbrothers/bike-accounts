import { useState } from 'react'
import { CATEGORIES, CATEGORY_BY_ID, type CategoryId } from '../lib/categories'
import { money, txnsInYear } from '../lib/summary'
import { taxYearLabel } from '../lib/taxYear'
import { needsChecking, type Txn } from '../lib/types'

interface Props {
  txns: Txn[]
  year: number
  setCategory: (t: Txn, c: CategoryId, remember: boolean) => Promise<number>
  deleteEntry: (t: Txn) => Promise<void>
  resolveDuplicate: (t: Txn, same: boolean) => Promise<void>
}

const dayLabel = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function byMonth(list: Txn[]): [string, Txn[]][] {
  const groups = new Map<string, Txn[]>()
  for (const t of list) {
    const key = new Date(t.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  return [...groups]
}

export default function Check({ txns, year, setCategory, deleteEntry, resolveDuplicate }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Txn | null>(null)
  const [toast, setToast] = useState('')

  const inYear = txnsInYear(txns, year).sort((a, b) => b.date.localeCompare(a.date))
  const toCheck = inYear.filter(needsChecking)
  const q = search.trim().toUpperCase()
  const list = (showAll ? inYear : toCheck).filter((t) => !q || t.description.toUpperCase().includes(q))

  async function choose(t: Txn, c: CategoryId, remember: boolean) {
    setOpen(null)
    const others = await setCategory(t, c, remember)
    if (others > 0) {
      setToast(`Also set ${others} other ${others === 1 ? 'payment' : 'payments'} from the same place`)
      setTimeout(() => setToast(''), 3500)
    }
  }

  return (
    <section>
      <h1>Check payments</h1>
      <div className="toggle">
        <button className={!showAll ? 'active' : ''} onClick={() => setShowAll(false)}>
          To check ({toCheck.length})
        </button>
        <button className={showAll ? 'active' : ''} onClick={() => setShowAll(true)}>
          All {taxYearLabel(year)}
        </button>
      </div>
      {showAll && (
        <input className="search" placeholder="Search payments…" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}

      {list.length === 0 && (
        <p className="empty">
          {showAll ? 'No payments for this year yet. Upload a statement to add them.' : 'Nothing to check. Every payment is sorted.'}
        </p>
      )}

      {byMonth(list).map(([month, items]) => (
        <div key={month}>
          <h2 className="group-title">{month}</h2>
          <ul className="group">
            {items.map((t) => (
              <li key={t.id} className="txn-row">
                <button className="txn" onClick={() => setOpen(t)}>
                  <span className="what">{t.description}</span>
                  <span className={`amt ${t.amount > 0 ? 'pos' : ''}`}>
                    {t.amount > 0 ? '+' : '−'}
                    {money(Math.abs(t.amount))}
                  </span>
                  <span className="meta">
                    {dayLabel(t.date)}
                    {t.duplicateOf ? (
                      <span className="cat none">Added twice?</span>
                    ) : (
                      <span className={`cat ${t.category ? '' : 'none'}`}>
                        {t.category ? CATEGORY_BY_ID[t.category].label : 'Tap to sort'}
                        {t.source === 'ai' && " (Claude's guess)"}
                      </span>
                    )}
                  </span>
                </button>
                {t.source === 'ai' && t.category && !t.duplicateOf && (
                  <button className="confirm" onClick={() => choose(t, t.category!, true)}>
                    Correct
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {open?.duplicateOf && (
        <SamePayment
          txn={open}
          other={txns.find((t) => t.id === open.duplicateOf)}
          onAnswer={async (same) => {
            setOpen(null)
            await resolveDuplicate(open, same)
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open && !open.duplicateOf && (
        <Picker
          txn={open}
          onPick={choose}
          onDelete={async (t) => {
            setOpen(null)
            await deleteEntry(t)
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </section>
  )
}

function SamePayment({ txn, other, onAnswer, onClose }: { txn: Txn; other?: Txn; onAnswer: (same: boolean) => void; onClose: () => void }) {
  const row = (t: Txn) => (
    <li className="pair">
      <span className="pair-what">{t.description}</span>
      <span className={`pair-amt ${t.amount > 0 ? 'pos' : ''}`}>{money(Math.abs(t.amount))}</span>
      <span className="pair-meta">
        {dayLabel(t.date)} · {t.importId === 'manual' ? 'added by hand' : 'from bank statement'}
      </span>
    </li>
  )
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Same payment?" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">Same payment?</h2>
        <p>These look like the same money. If they are, the app keeps one so it isn't counted twice.</p>
        <ul className="group">
          {row(txn)}
          {other && row(other)}
        </ul>
        <button className="primary" onClick={() => onAnswer(true)}>
          Yes, same payment. Keep one
        </button>
        <button className="secondary" onClick={() => onAnswer(false)}>
          No, they're different. Keep both
        </button>
      </div>
    </div>
  )
}

interface PickerProps {
  txn: Txn
  onPick: (t: Txn, c: CategoryId, remember: boolean) => void
  onDelete: (t: Txn) => void
  onClose: () => void
}

function Picker({ txn, onPick, onDelete, onClose }: PickerProps) {
  const [confirming, setConfirming] = useState(false)
  const addedByHand = txn.importId === 'manual'
  const [remember, setRemember] = useState(true)
  const isIn = txn.amount > 0
  // Show the categories that make sense for the direction of money first.
  const ordered = [
    ...CATEGORIES.filter((c) => (isIn ? c.kind === 'income' : c.kind === 'expense')),
    ...CATEGORIES.filter((c) => c.kind === 'ignore'),
    ...CATEGORIES.filter((c) => (isIn ? c.kind === 'expense' : c.kind === 'income')),
  ]
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Choose a category" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <p className="sheet-date">
              {dayLabel(txn.date)} · {isIn ? 'money in' : 'money out'}
            </p>
            <h2>{txn.description}</h2>
          </div>
          <p className={`sheet-amt ${isIn ? 'pos' : ''}`}>{money(Math.abs(txn.amount))}</p>
        </div>
        <label className="remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Use this for future payments to the same place
        </label>
        <ul className="group choices">
          {ordered.map((c) => (
            <li key={c.id}>
              <button className={txn.category === c.id ? 'chosen' : ''} onClick={() => onPick(txn, c.id, remember)}>
                <b>{c.label}</b>
                <small>{c.hint}</small>
              </button>
            </li>
          ))}
        </ul>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        {addedByHand && (
          <button className="link danger" onClick={() => (confirming ? onDelete(txn) : setConfirming(true))}>
            {confirming ? 'Tap again to delete it' : 'Delete this entry'}
          </button>
        )}
      </div>
    </div>
  )
}
