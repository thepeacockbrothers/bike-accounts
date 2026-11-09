import { useState, type FormEvent } from 'react'
import { CATEGORIES, type CategoryId } from '../lib/categories'
import { parseAmount } from '../lib/csv'
import { money } from '../lib/summary'
import type { Txn } from '../lib/types'

export interface NewEntry {
  date: string
  description: string
  amount: number
  category: CategoryId
}

interface Props {
  onSave: (e: NewEntry) => Promise<void>
  /** An existing payment this one would repeat, if any. */
  findRepeat: (e: NewEntry) => Txn | null
  onClose: () => void
}

const today = () => new Date().toISOString().slice(0, 10)
const longDay = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })

export default function Add({ onSave, findRepeat, onClose }: Props) {
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(today())
  const [category, setCategory] = useState<CategoryId | null>('takings')
  const [busy, setBusy] = useState(false)
  const [repeat, setRepeat] = useState<Txn | null>(null)

  const value = parseAmount(amount)
  const choices = CATEGORIES.filter((c) => c.kind === (direction === 'in' ? 'income' : 'expense'))
  const ready = value !== null && value > 0 && description.trim() !== '' && category !== null && !busy

  function switchTo(d: 'in' | 'out') {
    setDirection(d)
    setCategory(d === 'in' ? 'takings' : null)
  }

  const entry = (): NewEntry => ({
    date,
    description: description.trim(),
    amount: direction === 'in' ? Math.abs(value!) : -Math.abs(value!),
    category: category!,
  })

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    const match = findRepeat(entry())
    if (match) {
      setRepeat(match)
      return
    }
    await saveAnyway()
  }

  async function saveAnyway() {
    setBusy(true)
    await onSave(entry())
    setBusy(false)
  }

  if (repeat) {
    return (
      <div className="sheet-bg" onClick={onClose}>
        <div className="sheet" role="alertdialog" aria-label="Possible repeat" onClick={(e) => e.stopPropagation()}>
          <h2 className="sheet-title">Already added?</h2>
          <p>This looks the same as a payment that's already in:</p>
          <ul className="group">
            <li className="pair">
              <span className="pair-what">{repeat.description}</span>
              <span className={`pair-amt ${repeat.amount > 0 ? 'pos' : ''}`}>{money(Math.abs(repeat.amount))}</span>
              <span className="pair-meta">
                {longDay(repeat.date)} · {repeat.importId === 'manual' ? 'added by hand' : 'from bank statement'}
              </span>
            </li>
          </ul>
          <button className="primary" onClick={onClose}>
            Don't add it again
          </button>
          <button className="secondary" disabled={busy} onClick={saveAnyway}>
            It's a different payment, add it
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet add" role="dialog" aria-label="Add income or expense" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 className="sheet-title">Add a payment</h2>
        <p className="hint">For cash jobs and anything that won't be on the bank statement.</p>

        <div className="toggle">
          <button type="button" className={direction === 'in' ? 'active' : ''} onClick={() => switchTo('in')}>
            Money in
          </button>
          <button type="button" className={direction === 'out' ? 'active' : ''} onClick={() => switchTo('out')}>
            Money out
          </button>
        </div>

        <label className="amount-field">
          <span className="sr-only">Amount</span>
          <span aria-hidden>£</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </label>

        <label className="field">
          {direction === 'in' ? 'Who paid / what for' : 'What was it'}
          <input
            value={description}
            placeholder={direction === 'in' ? 'e.g. Cash, puncture repair' : 'e.g. Inner tubes from bike shop'}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="field">
          Date
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
        </label>

        <p className="field-label">Category</p>
        <ul className="group choices">
          {choices.map((c) => (
            <li key={c.id}>
              <button type="button" className={category === c.id ? 'chosen' : ''} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                <b>{c.label}</b>
                <small>{c.hint}</small>
              </button>
            </li>
          ))}
        </ul>

        <div className="sheet-actions">
          <button type="submit" className="primary" disabled={!ready}>
            {busy ? 'Saving…' : direction === 'in' ? 'Save income' : 'Save expense'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
