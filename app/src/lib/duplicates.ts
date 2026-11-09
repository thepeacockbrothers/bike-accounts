import type { Txn } from './types'

// Bank payments can take a few days to clear, so a payment added by hand on Monday
// might show on the statement on Thursday.
const DAYS_APART = 5

const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

const isManual = (t: Txn) => t.importId === 'manual'

/** Already paired with something, either way round. */
function pairedIds(txns: Txn[]) {
  const ids = new Set<string>()
  for (const t of txns) {
    if (t.duplicateOf) {
      ids.add(t.id)
      ids.add(t.duplicateOf)
    }
  }
  return ids
}

/**
 * Finds the existing payment that a new one probably repeats: same amount, same direction,
 * close in date. Hand-added entries are only compared against bank payments (and vice versa),
 * except that two hand-added entries on the same day for the same amount also count.
 */
export function findMatch(entry: Pick<Txn, 'date' | 'amount' | 'importId'>, existing: Txn[], taken = pairedIds(existing)) {
  let best: Txn | null = null
  let bestGap = Infinity
  for (const t of existing) {
    if (taken.has(t.id) || t.amount !== entry.amount) continue
    const gap = daysBetween(t.date, entry.date)
    const sameKind = isManual(t) === (entry.importId === 'manual')
    const limit = sameKind ? (entry.importId === 'manual' ? 0 : -1) : DAYS_APART
    if (gap <= limit && gap < bestGap) {
      best = t
      bestGap = gap
    }
  }
  return best
}

/** Marks newly uploaded bank payments that look like something he already added by hand. */
export function flagDuplicates(fresh: Txn[], existing: Txn[]): Txn[] {
  const taken = pairedIds(existing)
  return fresh.map((t) => {
    const match = findMatch(t, existing, taken)
    if (!match) return t
    taken.add(match.id)
    return { ...t, duplicateOf: match.id }
  })
}
