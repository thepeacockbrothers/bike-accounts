import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guessCategory, learnRules, payeeKey, sameBankPaymentKey, toTxns } from './categorise'
import { isCoconutExport, parseCoconut } from './coconut'
import { parseDate, parseStatement } from './csv'
import { findMatch, flagDuplicates } from './duplicates'
import { buildWorkbook } from './export'
import type { Txn } from './types'
import { summarise } from './summary'
import * as XLSX from 'xlsx'
import { quarterOf, taxYearOf } from './taxYear'

const sample = (name: string) => readFileSync(`samples/${name}.csv`, 'utf8')
const cat = (desc: string, amount: number) => guessCategory(desc, amount, []).category

describe('bank formats', () => {
  it('Barclays: single amount column, Memo description', () => {
    const t = parseStatement(sample('barclays'))
    expect(t).toHaveLength(8)
    expect(t[0]).toMatchObject({ date: '2025-10-03', amount: -45.2 })
    expect(t[0].description).toContain('SHELL')
  })
  it('Lloyds: separate debit and credit columns', () => {
    const t = parseStatement(sample('lloyds'))
    expect(t.map((x) => x.amount)).toEqual([-34.99, 25, -22.1, -54.3, -600])
    expect(t[0].description).toBe('HALFORDS 0123')
  })
  it('NatWest: Value column, blank first line, account name not used as description', () => {
    const t = parseStatement(sample('natwest'))
    expect(t).toHaveLength(3)
    expect(t[0]).toMatchObject({ date: '2025-12-02', amount: -60 })
    expect(t[0].description).toContain('ESSO')
    expect(t[0].description).not.toContain('MOBILE BIKE MAN')
  })
  it('HSBC: no header row', () => {
    const t = parseStatement(sample('hsbc'))
    expect(t).toEqual([
      { date: '2026-01-05', description: 'UPGRADE BIKES LTD', amount: -310.25 },
      { date: '2026-01-06', description: 'K PATEL', amount: 45 },
      { date: '2026-01-07', description: 'SCREWFIX DIRECT', amount: -23.47 },
    ])
  })
  it('Nationwide: preamble lines, £ signs and thousands separators', () => {
    const t = parseStatement(sample('nationwide'))
    expect(t.map((x) => x.amount)).toEqual([-41.2, 1060, -76.4])
  })
  it('rejects a file that is not a statement', () => {
    expect(() => parseStatement('hello,world\nfoo,bar')).toThrow()
  })
})

describe('dates and tax years', () => {
  it('parses UK formats', () => {
    expect(parseDate('03/10/2025')).toBe('2025-10-03')
    expect(parseDate('2 Dec 2025')).toBe('2025-12-02')
    expect(parseDate('02-Dec-25')).toBe('2025-12-02')
    expect(parseDate('Balance')).toBeNull()
  })
  it('splits tax years on 6 April', () => {
    expect(taxYearOf('2026-04-05')).toBe(2025)
    expect(taxYearOf('2026-04-06')).toBe(2026)
  })
  it('uses MTD standard quarters', () => {
    expect(quarterOf('2025-04-06')).toBe(1)
    expect(quarterOf('2025-07-05')).toBe(1)
    expect(quarterOf('2025-07-06')).toBe(2)
    expect(quarterOf('2025-12-31')).toBe(3)
    expect(quarterOf('2026-01-05')).toBe(3)
    expect(quarterOf('2026-01-06')).toBe(4)
    expect(quarterOf('2026-04-05')).toBe(4)
  })
})

describe('categorising', () => {
  it('knows common bike-mechanic payees', () => {
    expect(cat('SHELL WOOD GREEN ON 02 OCT BCC', -45.2)).toBe('van')
    expect(cat('BP CONNECT', -41.2)).toBe('van')
    expect(cat('MADISON CYCLES PLC', -212.4)).toBe('parts')
    expect(cat('SUMUP PAYOUT 071025', 142.5)).toBe('takings')
    expect(cat('EE LIMITED Q1234567 DDR', -18)).toBe('phone')
    expect(cat('GREGGS 1234', -6.5)).toBe('personal')
    expect(cat('HMRC SELF ASSESSMENT', -600)).toBe('transfer')
    expect(cat('ACCOUNT FEE', -8.5)).toBe('bank')
    expect(cat('DART CHARGE', -2.5)).toBe('van')
    expect(cat("'GOOGLE *ADS1234", -15)).toBe('other')
  })
  it('does not match short keywords inside other words', () => {
    expect(cat('COFFEE SHOP', -3)).toBeNull() // "EE"
  })
  it('treats unknown money in as takings, but not refunds', () => {
    expect(cat('J SMITH BIKE SERVICE', 85)).toBe('takings')
    expect(cat('HALFORDS REFUND', 34.99)).toBeNull()
    expect(cat('HALFORDS 0123', 34.99)).toBeNull()
  })
  it('leaves genuinely unclear payments for checking', () => {
    expect(cat('AMAZON.CO.UK*AB12C', -89.99)).toBeNull()
    expect(cat('TESCO STORES 2041', -54.3)).toBeNull()
  })
  it('remembered choices win, and match the next receipt from the same place', () => {
    expect(payeeKey('CARD PAYMENT TO TESCO STORES 2041 ON 12 NOV')).toBe('TESCO STORES')
    const rules = [{ pattern: payeeKey('TESCO STORES 2041'), category: 'parts' as const }]
    expect(guessCategory('TESCO STORES 3310', -12, rules)).toEqual({ category: 'parts', source: 'learned' })
  })
})

describe('import and totals', () => {
  it('gives the same ids when a statement is uploaded twice', () => {
    const raw = parseStatement(sample('barclays'))
    const a = toTxns(raw, [], '1').map((t) => t.id)
    const b = toTxns(raw, [], '2').map((t) => t.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })
  it('keeps two identical payments on the same day', () => {
    const t = toTxns(
      [
        { date: '2025-10-01', description: 'COSTA', amount: -3 },
        { date: '2025-10-01', description: 'COSTA', amount: -3 },
      ],
      [],
      '1',
    )
    expect(t[0].id).not.toBe(t[1].id)
  })
  it('adds up by HMRC category and quarter', () => {
    const txns = ['barclays', 'lloyds', 'natwest', 'hsbc', 'nationwide'].flatMap((n, i) =>
      toTxns(parseStatement(sample(n)), [], String(i)),
    )
    const s = summarise(txns, 2025)
    expect(s.totals.van[4]).toBe(45.2 + 60 + 41.2)
    expect(s.totals.van[1]).toBe(45.2) // Q2 runs to 5 Oct
    expect(s.totals.van[2]).toBe(60) // Q3: 6 Oct – 5 Jan
    expect(s.totals.van[3]).toBe(41.2) // Q4: Feb
    expect(s.turnover).toBe(85 + 142.5 + 25 + 120 + 45 + 1060)
    expect(s.totals.transfer[4]).toBe(600) // tax payment, not an expense
    expect(s.toCheck).toBeGreaterThan(0) // Amazon, Tesco, Halfords, Screwfix
  })
})

describe('accountant spreadsheet', () => {
  it('has a quarterly summary and every transaction', () => {
    const txns = toTxns(parseStatement(sample('barclays')), [], '1')
    const wb = buildWorkbook(txns, 2025, 'Mobile Bike Man')
    expect(wb.SheetNames).toEqual(['Summary', 'Transactions'])
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Summary, { header: 1 })
    const van = rows.find((r) => r[0] === 'Van, fuel & travel')!
    expect(van.slice(1, 8)).toEqual(['12', 'Car, van and travel expenses', 0, 45.2, 0, 0, 45.2])
    const list = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Transactions)
    expect(list).toHaveLength(8)
    expect(list.find((r) => String(r.Description).startsWith('AMAZON'))!['Needs checking']).toBe('Yes')
  })
})

describe('spotting payments added twice', () => {
  const manual = (date: string, amount: number, id = `m-${date}`): Txn => ({
    id, date, amount, description: 'Cash', category: 'takings', source: 'manual', importId: 'manual',
  })
  const bank = (date: string, amount: number, id = `b-${date}`): Txn => ({
    id, date, amount, description: 'J SMITH', category: 'takings', source: 'rule', importId: '1',
  })

  it('flags a statement payment matching one added by hand a few days earlier', () => {
    const [t] = flagDuplicates([bank('2025-10-08', 40)], [manual('2025-10-06', 40)])
    expect(t.duplicateOf).toBe('m-2025-10-06')
  })
  it('ignores different amounts, opposite directions and big gaps', () => {
    const existing = [manual('2025-10-06', 40)]
    expect(flagDuplicates([bank('2025-10-06', 41)], existing)[0].duplicateOf).toBeUndefined()
    expect(flagDuplicates([bank('2025-10-06', -40)], existing)[0].duplicateOf).toBeUndefined()
    expect(flagDuplicates([bank('2025-10-20', 40)], existing)[0].duplicateOf).toBeUndefined()
  })
  it('pairs each hand-added payment with only one statement payment', () => {
    const flagged = flagDuplicates([bank('2025-10-06', 40, 'b1'), bank('2025-10-07', 40, 'b2')], [manual('2025-10-06', 40)])
    expect(flagged.filter((t) => t.duplicateOf)).toHaveLength(1)
  })
  it('never flags two statement payments against each other', () => {
    expect(findMatch({ date: '2025-10-06', amount: 3, importId: '2' }, [bank('2025-10-06', 3)])).toBeNull()
  })
  it('warns when the same amount is added by hand twice on one day', () => {
    expect(findMatch({ date: '2025-10-06', amount: 40, importId: 'manual' }, [manual('2025-10-06', 40)])).not.toBeNull()
    expect(findMatch({ date: '2025-10-07', amount: 40, importId: 'manual' }, [manual('2025-10-06', 40)])).toBeNull()
  })
})

describe('Coconut import', () => {
  const rows = parseCoconut(sample('coconut'))
  const by = (start: string) => rows.find((r) => r.description.startsWith(start))!

  it('is recognised from its header', () => {
    expect(isCoconutExport(sample('coconut'))).toBe(true)
    expect(isCoconutExport(sample('barclays'))).toBe(false)
  })
  it('keeps the SA103 categories he chose in Coconut', () => {
    expect(by('J SMITH').category).toBe('takings')
    expect(by('Wiggle').category).toBe('parts')
    expect(by('LV LIFE').category).toBe('premises')
  })
  it('treats wages and transfers from his own account as not business', () => {
    expect(rows.find((r) => r.amount === -100)!.category).toBe('personal')
    expect(rows.find((r) => r.amount === 200)!.category).toBe('transfer')
  })
  it('asks about recent customer payments Coconut filed as "Paying In"', () => {
    expect(by('JONES K').category).toBeNull()
  })
  it('counts only the business part of a split payment', () => {
    const fuel = by('SHELL HIGH')
    expect(fuel.amount).toBe(-50)
    expect(fuel.description).toContain('business part of £53.58')
  })
  it('brings cash entries across as hand-added', () => {
    expect(by('Cash:')).toMatchObject({ manual: true, amount: -4.65, description: 'Cash: Paid cash for these bits', category: 'phone' })
  })
  it('learns payees from history', () => {
    const txns = toTxns(rows, [], '1').map((t, i) => ({ ...t, category: rows[i].category }))
    const rules = learnRules(txns)
    expect(rules).toContainEqual({ pattern: 'WIGGLE', category: 'parts' })
    expect(guessCategory('WIGGLE LIMITED ON 02 NOV BDC', -20, rules).category).toBe('parts')
  })
  it('matches the same payment from a Barclays statement worded differently', () => {
    const a = { date: '2023-09-13', amount: -34.31, description: 'Wiggle Limited ON 12 SEP BDC' }
    const b = { date: '2023-09-13', amount: -34.31, description: 'WIGGLE LIMITED        ON 12 SEP          BCC' }
    expect(sameBankPaymentKey(a)).toBe(sameBankPaymentKey(b))
  })
})
