import { CATEGORIES, CATEGORY_BY_ID, type CategoryId } from './categories'
import { quarterOf, taxYearOf } from './taxYear'
import { needsChecking, type Txn } from './types'

export interface Summary {
  /** Per category: [Q1, Q2, Q3, Q4, year]. Income and expenses both as positive figures. */
  totals: Record<CategoryId, [number, number, number, number, number]>
  turnover: number
  otherIncome: number
  expenses: number // allowable running costs, excluding equipment
  equipment: number
  profit: number
  toCheck: number
  count: number
}

const round = (n: number) => Math.round(n * 100) / 100

export function txnsInYear(txns: Txn[], year: number) {
  return txns.filter((t) => taxYearOf(t.date) === year)
}

export function summarise(txns: Txn[], year: number): Summary {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c.id, [0, 0, 0, 0, 0]])) as Summary['totals']
  const inYear = txnsInYear(txns, year)
  for (const t of inYear) {
    if (!t.category) continue
    const sign = CATEGORY_BY_ID[t.category].kind === 'income' ? 1 : -1
    const row = totals[t.category]
    row[quarterOf(t.date) - 1] += sign * t.amount
    row[4] += sign * t.amount
  }
  for (const row of Object.values(totals)) row.forEach((v, i) => (row[i] = round(v)))

  const expenses = round(
    CATEGORIES.filter((c) => c.kind === 'expense' && c.id !== 'equipment').reduce((n, c) => n + totals[c.id][4], 0),
  )
  const turnover = totals.takings[4]
  const otherIncome = totals.other_income[4]
  const equipment = totals.equipment[4]
  return {
    totals,
    turnover,
    otherIncome,
    expenses,
    equipment,
    profit: round(turnover + otherIncome - expenses - equipment),
    toCheck: inYear.filter(needsChecking).length,
    count: inYear.length,
  }
}

export const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 })
