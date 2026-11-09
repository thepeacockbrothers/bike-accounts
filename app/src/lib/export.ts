import * as XLSX from 'xlsx'
import { CATEGORIES, CATEGORY_BY_ID } from './categories'
import { summarise, txnsInYear } from './summary'
import { QUARTER_LABELS, quarterOf, taxYearLabel } from './taxYear'
import type { Txn } from './types'

/** One workbook for the accountant: quarterly summary by HMRC category + every transaction. */
export function exportForAccountant(txns: Txn[], year: number, businessName: string) {
  XLSX.writeFile(buildWorkbook(txns, year, businessName), `${businessName} accounts ${taxYearLabel(year)}.xlsx`)
}

export function buildWorkbook(txns: Txn[], year: number, businessName: string) {
  const s = summarise(txns, year)
  const label = taxYearLabel(year)

  const summaryRows: (string | number)[][] = [
    [`${businessName} — tax year ${label}`],
    ['Categories follow HMRC self-employment (SA103S) boxes. Cash basis, from bank statements.'],
    [],
    ['Category', 'HMRC box', 'HMRC description', ...[1, 2, 3, 4].map((q) => `Q${q} (${QUARTER_LABELS[q as 1]})`), 'Full year'],
  ]
  for (const kind of ['income', 'expense'] as const) {
    summaryRows.push([kind === 'income' ? 'INCOME' : 'EXPENSES'])
    for (const c of CATEGORIES.filter((c) => c.kind === kind)) {
      summaryRows.push([c.label, c.box ?? '', c.hmrc, ...s.totals[c.id]])
    }
  }
  summaryRows.push(
    [],
    ['Turnover', '', '', '', '', '', '', s.turnover],
    ['Total running costs (boxes 11–19)', '', '', '', '', '', '', s.expenses],
    ['Tools & equipment', '', '', '', '', '', '', s.equipment],
    ['Profit (before any allowances)', '', '', '', '', '', '', s.profit],
    [],
    ['Excluded (not business)', '', '', ...s.totals.personal.slice(0, 4).map((v, i) => v + s.totals.transfer[i]), s.totals.personal[4] + s.totals.transfer[4]],
  )
  if (s.toCheck > 0) summaryRows.push([], [`NOTE: ${s.toCheck} transaction(s) were not confirmed — see "Needs checking" column.`])

  const txnRows = txnsInYear(txns, year)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const c = t.category ? CATEGORY_BY_ID[t.category] : null
      return {
        Date: t.date,
        Description: t.description,
        'Money in': t.amount > 0 ? t.amount : '',
        'Money out': t.amount < 0 ? -t.amount : '',
        Category: c?.label ?? 'UNCATEGORISED',
        'HMRC box': c?.box ?? '',
        Quarter: `Q${quarterOf(t.date)}`,
        'Needs checking': !t.category || t.source === 'ai' ? 'Yes' : '',
      }
    })

  const wb = XLSX.utils.book_new()
  const summary = XLSX.utils.aoa_to_sheet(summaryRows)
  summary['!cols'] = [{ wch: 34 }, { wch: 9 }, { wch: 48 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')
  const list = XLSX.utils.json_to_sheet(txnRows)
  list['!cols'] = [{ wch: 11 }, { wch: 50 }, { wch: 10 }, { wch: 10 }, { wch: 26 }, { wch: 9 }, { wch: 8 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, list, 'Transactions')
  return wb
}
