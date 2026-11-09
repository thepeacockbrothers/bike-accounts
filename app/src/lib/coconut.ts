// Imports the "Combined View" CSV export from the Coconut app, keeping the categories
// he already chose there so years of history don't need sorting again.

import type { CategoryId } from './categories'
import { parseAmount, parseCsvRows, parseDate, StatementError } from './csv'
import { taxYearOf } from './taxYear'

export interface CoconutRow {
  date: string
  description: string
  amount: number
  category: CategoryId | null
  /** Coconut "Manual Adjustments": cash payments he typed in, not on the bank statement. */
  manual: boolean
}

export const isCoconutExport = (text: string) => /^\uFEFF?Institution,Account,Date,.*SA103s Category/.test(text)

// Coconut's SA103S wording (it differs slightly from HMRC's in places).
const BY_SA103: [string, CategoryId][] = [
  ['your turnover', 'takings'],
  ['any other business income', 'other_income'],
  ['costs of goods', 'parts'],
  ['cost of goods', 'parts'],
  ['car, van', 'van'],
  ['wages', 'staff'],
  ['rent, rates', 'premises'],
  ['repairs', 'repairs'],
  ['accountancy', 'professional'],
  ['interest', 'bank'],
  ['phone, fax', 'phone'],
  ['other allowable', 'other'],
]

// Coconut categories with no SA103 box: not business income or costs.
const PERSONAL = ['your wages', 'personal', 'entertainment', 'donations']
const TRANSFER = ['paying in', 'loan repayments', 'saving for tax', 'income tax/ni']

/** "123456 12345678 OPTIONAL FT": a transfer from one of his own accounts (sort code + account number). */
const fromOwnAccount = (desc: string) => /^\d{6} \d{8}( (OPTIONAL|MOBILE-CHANNEL))? FT$/.test(desc.trim())

function categoryFor(sa103: string, coconutCategory: string, desc: string, date: string): CategoryId | null {
  const sa = sa103.toLowerCase()
  const hit = BY_SA103.find(([prefix]) => sa.startsWith(prefix))
  if (hit) return hit[1]
  const c = coconutCategory.toLowerCase()
  if (PERSONAL.includes(c)) return 'personal'
  // Coconut filed some customer payments under "Paying In" (so not as takings). Leave those
  // alone for years that are probably filed, but ask about them for recent years.
  if (c === 'paying in' && !fromOwnAccount(desc) && taxYearOf(date) >= 2025) return null
  if (TRANSFER.includes(c)) return 'transfer'
  return null
}

export function parseCoconut(text: string): CoconutRow[] {
  const [header, ...rows] = parseCsvRows(text)
  const col = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new StatementError(`This Coconut file is missing the "${name}" column.`)
    return i
  }
  const c = {
    institution: col('Institution'),
    date: col('Date'),
    description: col('Description'),
    original: col('Original Description'),
    amount: col('Transaction Amount'),
    business: col('Business Amount'),
    category: col('Category'),
    sa103: col('SA103s Category'),
    notes: col('Notes'),
  }

  const out: CoconutRow[] = []
  for (const r of rows) {
    const date = parseDate(r[c.date] ?? '')
    const full = parseAmount(r[c.amount] ?? '')
    const business = parseAmount(r[c.business] ?? '') ?? full
    if (!date || full === null || business === null || full === 0) continue
    const manual = r[c.institution] === 'Manual Adjustments'
    const notes = r[c.notes]?.trim() ?? ''
    let description = manual
      ? `Cash: ${notes || r[c.category]}`
      : (r[c.original] || r[c.description]).replace(/\s+/g, ' ').trim()
    // Part-business payments: count only the business share, as he did in Coconut.
    if (business !== full) description += ` (business part of £${Math.abs(full).toFixed(2)})`
    out.push({
      date,
      description,
      amount: business,
      category: categoryFor(r[c.sa103] ?? '', r[c.category] ?? '', r[c.original] ?? '', date),
      manual,
    })
  }
  if (out.length === 0) throw new StatementError('No payments found in that Coconut file.')
  return out
}
