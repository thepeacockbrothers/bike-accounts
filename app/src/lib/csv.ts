// Reads bank statement CSVs. High street banks all use slightly different layouts,
// so rather than one parser per bank we find the header row and work out which
// columns hold the date, description and amount(s).

export interface RawTxn {
  date: string
  description: string
  amount: number
}

export class StatementError extends Error {}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  text = text.replace(/^\uFEFF/, '') // byte-order mark some banks add
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** UK banks give dates as day-first. Returns YYYY-MM-DD or null. */
export function parseDate(s: string): string | null {
  s = s.trim()
  let y: number, m: number, d: number
  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) [y, m, d] = [+match[1], +match[2], +match[3]]
  else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    ;[d, m, y] = [+match[1], +match[2], +match[3]]
  } else if ((match = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/))) {
    d = +match[1]
    m = MONTHS[match[2].toLowerCase()]
    y = +match[3]
  } else return null
  if (y < 100) y += 2000
  if (!m || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "£1,234.50", "-12.00", "(12.00)", "12.00 DR" -> number. Empty -> null. */
export function parseAmount(s: string): number | null {
  if (!s) return null
  let t = s.replace(/[£$,\s]/g, '')
  let sign = 1
  if (/^\(.*\)$/.test(t)) {
    sign = -1
    t = t.slice(1, -1)
  }
  if (/DR$/i.test(t)) {
    sign = -1
    t = t.slice(0, -2)
  } else if (/CR$/i.test(t)) t = t.slice(0, -2)
  if (t === '' || !/^[+-]?\d*\.?\d+$/.test(t)) return null
  return Math.round(sign * parseFloat(t) * 100) / 100
}

interface Columns {
  date: number
  desc: number[]
  amount?: number
  out?: number
  in?: number
}

const find = (header: string[], re: RegExp, skip: number[] = []) =>
  header.findIndex((h, i) => re.test(h) && !skip.includes(i))

function columnsFromHeader(header: string[]): Columns | null {
  const h = header.map((c) => c.toLowerCase())
  const date = find(h, /date/)
  if (date < 0) return null
  const out = find(h, /debit|paid out|money out|withdrawal|payments?$/)
  const inn = find(h, /credit|paid in|money in|deposit|receipts?$/)
  const amount = find(h, /^amount|^value|amount$/)
  const split = out >= 0 && inn >= 0 // separate money-in / money-out columns (Lloyds, Nationwide…)
  if (!split && amount < 0) return null
  // Prefer a proper description column; fall back to memo / name / reference.
  const desc = [
    find(h, /description|details|narrative|memo|transaction$/),
    find(h, /payee|name|merchant/, [date]),
    find(h, /reference/),
  ].filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx && !/account (name|number)|sort code/.test(h[i]))
  if (!desc.length) return null
  return { date, desc, ...(split ? { out, in: inn } : { amount }) }
}

/** HSBC and some others export with no header: date, description, amount. */
function guessColumns(rows: string[][]): Columns | null {
  const sample = rows.slice(0, 20)
  const width = Math.max(...sample.map((r) => r.length))
  const share = (col: number, test: (s: string) => boolean) =>
    sample.filter((r) => r[col] !== undefined && test(r[col])).length / sample.length
  let date = -1
  let amount = -1
  let desc = -1
  let longest = 0
  for (let c = 0; c < width; c++) {
    if (date < 0 && share(c, (s) => parseDate(s) !== null) > 0.8) date = c
    else if (amount < 0 && share(c, (s) => parseAmount(s) !== null) > 0.8) amount = c
    else {
      const len = sample.reduce((n, r) => n + (r[c]?.length ?? 0), 0)
      if (len > longest) [longest, desc] = [len, c]
    }
  }
  return date >= 0 && amount >= 0 && desc >= 0 ? { date, amount, desc: [desc] } : null
}

export function parseStatement(text: string): RawTxn[] {
  const rows = parseCsvRows(text)
  if (rows.length === 0) throw new StatementError('That file looks empty.')

  let cols: Columns | null = null
  let start = 0
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    cols = columnsFromHeader(rows[i])
    if (cols) {
      start = i + 1
      break
    }
  }
  if (!cols) cols = guessColumns(rows)
  if (!cols) {
    throw new StatementError(
      "Couldn't read this statement. Please download it from online banking as a CSV file (not PDF).",
    )
  }

  const txns: RawTxn[] = []
  for (const r of rows.slice(start)) {
    const date = parseDate(r[cols.date] ?? '')
    if (!date) continue // balance lines, footers etc.
    let amount: number | null
    if (cols.amount !== undefined) amount = parseAmount(r[cols.amount] ?? '')
    else {
      const out = parseAmount(r[cols.out!] ?? '') ?? 0
      const inn = parseAmount(r[cols.in!] ?? '') ?? 0
      amount = Math.round((inn - Math.abs(out)) * 100) / 100
    }
    if (amount === null || amount === 0) continue
    const description = cols.desc
      .map((i) => (r[i] ?? '').replace(/^'/, '')) // NatWest prefixes text with an apostrophe
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    txns.push({ date, description: description || '(no description)', amount })
  }
  if (txns.length === 0) throw new StatementError('No transactions found in that file.')
  return txns
}
