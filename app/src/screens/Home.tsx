import type { Tab } from '../App'
import { businessName, downloadSpreadsheet } from '../lib/settings'
import { money, summarise } from '../lib/summary'
import type { Txn } from '../lib/types'
import { Chevron, SettingsIcon, SheetIcon, TaxIcon, UploadIcon } from './icons'
import YearPicker from './YearPicker'

interface Props {
  txns: Txn[]
  year: number
  years: number[]
  setYear: (y: number) => void
  go: (t: Tab) => void
}

const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function Home({ txns, year, years, setYear, go }: Props) {
  const s = summarise(txns, year)
  const lastDate = txns.reduce((d, t) => (t.importId !== 'manual' && t.date > d ? t.date : d), '')

  return (
    <section>
      <header className="top">
        <p className="business">{businessName()}</p>
        <div className="top-right">
          <YearPicker year={year} years={years} setYear={setYear} />
          <button className="icon-button" aria-label="Settings" onClick={() => go('settings')}>
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="hero">
        <p className="hero-label">Profit this tax year</p>
        <p className={`hero-figure ${s.profit < 0 ? 'neg' : ''}`}>{money(s.profit)}</p>
        <dl className="split">
          <div>
            <dt>Money in</dt>
            <dd className="pos">{money(s.turnover + s.otherIncome)}</dd>
          </div>
          <div>
            <dt>Business costs</dt>
            <dd>{money(s.expenses + s.equipment)}</dd>
          </div>
        </dl>
      </div>

      {s.toCheck > 0 && (
        <button className="tag" onClick={() => go('check')}>
          <span className="tag-count">{s.toCheck}</span>
          <span>{s.toCheck === 1 ? 'payment to check' : 'payments to check'}</span>
          <Chevron />
        </button>
      )}

      <MtdNotice turnover={s.turnover} year={year} />

      <button className="primary" onClick={() => go('upload')}>
        <UploadIcon />
        Upload bank statement
      </button>

      <div className="group">
        <button className="row" disabled={s.count === 0} onClick={() => downloadSpreadsheet(txns, year)}>
          <SheetIcon />
          <span className="row-text">Download spreadsheet for accountant</span>
          <Chevron />
        </button>
        <button className="row" onClick={() => go('tax')}>
          <TaxIcon />
          <span className="row-text">Tax return figures</span>
          <Chevron />
        </button>
      </div>

      <p className="footnote">
        {lastDate ? `Statements uploaded up to ${longDate(lastDate)}` : 'No statements uploaded yet'}
        {s.count > 0 && s.toCheck === 0 && '. Everything is sorted.'}
      </p>
    </section>
  )
}

function MtdNotice({ turnover, year }: { turnover: number; year: number }) {
  // MTD for Income Tax: £50k from April 2026, £30k from April 2027, £20k from April 2028,
  // each based on turnover two tax years earlier.
  const thresholds: [number, number][] = [
    [2024, 50000],
    [2025, 30000],
    [2026, 20000],
  ]
  const limit = thresholds.find(([y]) => y === year)?.[1]
  if (!limit || turnover < limit * 0.8) return null
  return (
    <p className="note">
      {turnover > limit
        ? `Takings are over ${money(limit)}, so Making Tax Digital starts for you in April ${year + 2}: quarterly updates instead of one return a year.`
        : `If takings go over ${money(limit)} this year, Making Tax Digital starts for you in April ${year + 2}.`}
    </p>
  )
}
