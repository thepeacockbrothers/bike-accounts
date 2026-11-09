import type { CategoryId } from './categories'
import type { RawTxn } from './csv'
import type { Rule, Source, Txn } from './types'

// Bank-added noise that says how a payment was made rather than who it was to.
const NOISE = new Set([
  'CARD', 'PAYMENT', 'PAYMENTS', 'TO', 'FROM', 'ON', 'AT', 'REF', 'REFERENCE', 'DIRECT', 'DEBIT', 'DD',
  'SO', 'STO', 'STANDING', 'ORDER', 'FASTER', 'FPI', 'FPO', 'BGC', 'BACS', 'POS', 'DEB', 'VIS', 'VISA',
  'CONTACTLESS', 'PURCHASE', 'TFR', 'TRANSFER', 'GBP', 'LTD', 'LIMITED', 'UK', 'CD', 'CR', 'DR',
  'MOBILE', 'BILL', 'ONLINE', 'BANKING', 'INTERNET', 'BANK', 'GIRO', 'CREDIT',
  // Barclays transaction codes
  'FT', 'DDR', 'BCC', 'BDC', 'CLP', 'CHG', 'CPT', 'OTR', 'OPTIONAL', 'CHANNEL',
])

/**
 * Turns "CARD PAYMENT TO SHELL WOOD GREEN 12/03 ON 13 MAR" into "SHELL WOOD" so a
 * remembered choice for one Shell receipt applies to the next one.
 */
export function payeeKey(description: string): string {
  const words = description
    .toUpperCase()
    .replace(/[^A-Z0-9& ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/\d/.test(w) && !NOISE.has(w) && !/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test(w))
  return words.slice(0, 2).join(' ')
}

// Built-in guesses for a mobile bike mechanic. First match wins.
// Word-bounded so "EE" doesn't match "FEES" and "BP" doesn't match "BPAY".
const BUILT_IN: [RegExp, CategoryId][] = [
  // Money in
  [/\b(SUMUP|SQUARE|SQ \*|ZETTLE|IZETTLE|STRIPE|PAYPAL PAYOUT|TAKEPAYMENTS|DOJO)\b/, 'takings'],
  // Tax and moving money — not business costs
  [/\b(HMRC|INLAND REVENUE|SELF ASSESSMENT)\b/, 'transfer'],
  [/\b(SAVINGS|ISA|OWN ACCOUNT|TO A\/C)\b/, 'transfer'],
  // Bank fees (check before suppliers: "SUMUP FEE" etc.)
  [/\b(ACCOUNT FEE|MONTHLY FEE|SERVICE CHARGE|COMMISSION|OVERDRAFT|INTEREST CHARGED|NON-STERLING|BANK CHARGES?|ACCOUNT CHARGES?|CHARGES APPLIED|SUMUP FEES?|CARD FEES?)\b/, 'bank'],
  // Bike parts suppliers and wholesalers
  [/\b(MADISON|HOTLINES|UPGRADE BIKES|EXTRA UK|ZYRO|FISHER OUTDOOR|RALEIGH|SHIMANO|SRAM|CHICKEN CYCLE|CYCLE ?TECH|WIGGLE|CHAIN REACTION|SIGMA SPORT|EVANS CYCLES|TREDZ|MERLIN CYCLES|BIKE24|PLANET X|RIBBLE|HALFORDS|CONTINENTAL|SCHWALBE|PARK TOOL|WELDTITE|MUC-?OFF|SILVERFISH|MOORE LARGE|ICE TOOLZ|TRP|CLARKS CYCLE)\b/, 'parts'],
  // Fuel and van
  [/\b(SHELL|BP|ESSO|TEXACO|JET|GULF|APPLEGREEN|MFG|MOTOR FUEL|ASDA PETROL|TESCO PFS|SAINSBURYS PETROL|MORRISONS PETROL|FUEL|PETROL|DIESEL|EUROGARAGES|EG GROUP|RONTEC|DVLA|VEHICLE TAX|RINGGO|PAYBYPHONE|JUSTPARK|NCP|PARKING|DART CHARGE|CONGESTION|ULEZ|TFL|KWIK FIT|ATS EUROMASTER|NATIONAL TYRES|MOT)\b/, 'van'],
  // Phone and internet
  [/\b(EE|VODAFONE|O2|THREE|GIFFGAFF|TESCO MOBILE|SKY MOBILE|BT|BT GROUP|VIRGIN MEDIA|PLUSNET|TALKTALK|POST OFFICE|ROYAL MAIL|STAPLES|VIKING)\b/, 'phone'],
  // Advertising, software, subscriptions
  [/\bGOOGLE ?\*? ?ADS/, 'other'], // often followed straight by a number, e.g. GOOGLE *ADS1234
  [/\b(FACEBK|FACEBOOK|META ADS|YELL|CHECKATRADE|BARK\.COM|BARK|WIX|SQUARESPACE|GODADDY|123 ?REG|IONOS|MICROSOFT|ADOBE|DROPBOX|CANVA|VISTAPRINT)\b/, 'other'],
  // Business insurers (generic "insurance" could be the van or personal, so left to check)
  [/\b(SIMPLY BUSINESS|HISCOX|MARKEL)\b/, 'premises'],
  // Accountant
  [/\b(ACCOUNTANT|ACCOUNTANCY|ACCOUNTANTS|BOOKKEEPING|SOLICITOR)\b/, 'professional'],
  // Obvious personal spending
  [/\b(NETFLIX|SPOTIFY|DISNEY|PRIME VIDEO|DELIVEROO|JUST EAT|UBER EATS|MCDONALDS|GREGGS|COSTA|STARBUCKS|PUB|CINEMA|ATM|CASH WITHDRAWAL|CASHPOINT)\b/, 'personal'],
]

export interface Guess {
  category: CategoryId | null
  source: Source | null
}

export function guessCategory(description: string, amount: number, rules: Rule[]): Guess {
  const key = payeeKey(description)
  const upper = description.toUpperCase()

  // His own choices beat everything else.
  // Short patterns only count as an exact match, so "EE" can't match inside other names.
  const learned = rules.find((r) => r.pattern && (r.pattern === key || (r.pattern.length >= 5 && upper.includes(r.pattern))))
  if (learned) return { category: learned.category, source: 'learned' }

  let wrongWay = false
  for (const [re, cat] of BUILT_IN) {
    if (!re.test(upper)) continue
    // A keyword in the wrong direction (a refund FROM Halfords, a fee TO SumUp) isn't a match.
    const wantsIncome = cat === 'takings' || cat === 'other_income'
    if (wantsIncome !== amount > 0 && cat !== 'transfer' && cat !== 'personal') {
      wrongWay = true
      continue
    }
    return { category: cat, source: 'rule' }
  }

  // Money in to a business account is almost always a customer paying.
  if (amount > 0 && !wrongWay && !/\b(REFUND|REVERSAL|RETURN|TRANSFER|TFR|SAVINGS|HMRC)\b/.test(upper)) {
    return { category: 'takings', source: 'rule' }
  }
  return { category: null, source: null }
}

/** Small deterministic string hash (FNV-1a), good enough for de-duplication. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function toTxns(raw: RawTxn[], rules: Rule[], importId: string): Txn[] {
  // Two identical coffees on the same day are different transactions, so number repeats.
  const seen = new Map<string, number>()
  return raw.map((r) => {
    const base = `${r.date}|${r.amount.toFixed(2)}|${r.description.toUpperCase()}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return {
      id: hash(base) + '-' + hash(base + '#' + n),
      date: r.date,
      description: r.description,
      amount: r.amount,
      importId,
      ...guessCategory(r.description, r.amount, rules),
    }
  })
}

/**
 * Works out "this payee is always X" from past, already-sorted payments: a payee seen at least
 * twice that went to the same category at least 80% of the time.
 */
export function learnRules(txns: Pick<Txn, 'description' | 'category' | 'importId'>[]): Rule[] {
  const byPayee = new Map<string, Map<CategoryId, number>>()
  for (const t of txns) {
    if (!t.category || t.importId === 'manual') continue
    const key = payeeKey(t.description)
    if (!key) continue
    const counts = byPayee.get(key) ?? new Map<CategoryId, number>()
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
    byPayee.set(key, counts)
  }
  const rules: Rule[] = []
  for (const [pattern, counts] of byPayee) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    const [category, n] = [...counts].sort((a, b) => b[1] - a[1])[0]
    if (total >= 2 && n / total >= 0.8) rules.push({ pattern, category })
  }
  return rules
}

/** Key for spotting the same bank payment when two exports word the description slightly differently. */
export const sameBankPaymentKey = (t: Pick<Txn, 'date' | 'amount' | 'description'>) =>
  `${t.date}|${t.amount.toFixed(2)}|${payeeKey(t.description)}`
