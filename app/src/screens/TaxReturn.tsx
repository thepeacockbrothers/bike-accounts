import { useState } from 'react'
import { downloadSpreadsheet } from '../lib/settings'
import { CATEGORIES } from '../lib/categories'
import { money, summarise } from '../lib/summary'
import { filingDeadline } from '../lib/taxYear'
import type { Txn } from '../lib/types'
import { SheetIcon } from './icons'
import YearPicker from './YearPicker'

interface Props {
  txns: Txn[]
  year: number
  years: number[]
  setYear: (y: number) => void
}

// HMRC lets you round income down and expenses up to whole pounds.
const down = (n: number) => Math.floor(n)
const up = (n: number) => Math.ceil(n)

export default function TaxReturn({ txns, year, years, setYear }: Props) {
  const s = summarise(txns, year)
  const yearOver = new Date() >= new Date(`${year + 1}-04-06`)
  const expenseRows = CATEGORIES.filter((c) => c.kind === 'expense' && c.box && s.totals[c.id][4])
  const totalExpenses = expenseRows.reduce((n, c) => n + up(s.totals[c.id][4]), 0)

  return (
    <section>
      <header className="top">
        <h1>Tax return</h1>
        <YearPicker year={year} years={years} setYear={setYear} />
      </header>

      <p className="lede">Due online by {filingDeadline(year)}.</p>
      {!yearOver && <p className="note">This tax year ends on 5 April {year + 1}, so these are running totals.</p>}
      {s.toCheck > 0 && (
        <p className="note warn">
          {s.toCheck} {s.toCheck === 1 ? 'payment still needs' : 'payments still need'} checking before these figures are final.
        </p>
      )}

      <h2 className="group-title">Income</h2>
      <ul className="group">
        <Row box="9" label="Your turnover" value={down(s.turnover)} />
        {s.otherIncome > 0 && <Row box="10" label="Any other business income" value={down(s.otherIncome)} />}
      </ul>

      <h2 className="group-title">Expenses</h2>
      <ul className="group">
        {expenseRows.map((c) => (
          <Row key={c.id} box={c.box!} label={c.hmrc} value={up(s.totals[c.id][4])} />
        ))}
        <Row box="20" label="Total allowable expenses" value={totalExpenses} strong />
      </ul>

      <ul className="group">
        <Row box="21" label="Net profit" value={Math.max(0, down(s.turnover) + down(s.otherIncome) - totalExpenses)} strong />
      </ul>

      {s.equipment > 0 && <p className="note">Tools and equipment ({money(s.equipment)}) aren't included above.</p>}
      <p className="footnote">Tap a figure to copy it.</p>

      <button className="secondary" disabled={s.count === 0} onClick={() => downloadSpreadsheet(txns, year)}>
        <SheetIcon />
        Download spreadsheet
      </button>
    </section>
  )
}

function Row({ box, label, value, strong }: { box: string; label: string; value: number; strong?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(String(value))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <li>
      <button className={`figure ${strong ? 'strong' : ''}`} onClick={copy}>
        <span className="figure-box">Box {box}</span>
        <span className="figure-label">{label}</span>
        <span className="figure-num">{copied ? 'Copied' : `£${value.toLocaleString('en-GB')}`}</span>
      </button>
    </li>
  )
}
