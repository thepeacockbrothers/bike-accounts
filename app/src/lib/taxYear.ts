// UK tax year runs 6 April to 5 April. Dates are ISO strings (YYYY-MM-DD).

/** Start year of the tax year a date falls in, e.g. 2025-05-01 -> 2025 (the 2025-26 year). */
export function taxYearOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return m > 4 || (m === 4 && d >= 6) ? y : y - 1
}

export const taxYearLabel = (start: number) => `${start}–${String(start + 1).slice(2)}`

/** MTD standard quarters: 6 Apr–5 Jul, 6 Jul–5 Oct, 6 Oct–5 Jan, 6 Jan–5 Apr. */
export function quarterOf(date: string): 1 | 2 | 3 | 4 {
  const [, m, d] = date.split('-').map(Number)
  const shifted = d >= 6 ? m : m - 1 // a date before the 6th belongs to the previous "month"
  if (shifted >= 4 && shifted <= 6) return 1
  if (shifted >= 7 && shifted <= 9) return 2
  if (shifted >= 10 || shifted === 0) return 3 // Oct, Nov, Dec, and 1–5 Jan
  return 4
}

export const QUARTER_LABELS = {
  1: '6 Apr – 5 Jul',
  2: '6 Jul – 5 Oct',
  3: '6 Oct – 5 Jan',
  4: '6 Jan – 5 Apr',
} as const

export function currentTaxYear(): number {
  return taxYearOf(new Date().toISOString().slice(0, 10))
}

/** Online return deadline: 31 January after the tax year ends. */
export const filingDeadline = (start: number) => `31 January ${start + 2}`
