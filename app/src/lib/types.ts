import type { CategoryId } from './categories'

export type Source = 'rule' | 'learned' | 'ai' | 'manual'

export interface Txn {
  /** Stable hash of date/amount/description so re-uploading a statement doesn't duplicate. */
  id: string
  date: string // YYYY-MM-DD
  description: string
  /** Positive = money in, negative = money out. */
  amount: number
  category: CategoryId | null
  source: Source | null
  importId: string
  /** Set when this looks like the same payment as another one (e.g. added by hand, then on the statement). */
  duplicateOf?: string
}

/** A remembered "this payee is always X" choice. */
export interface Rule {
  pattern: string
  category: CategoryId
}

export const needsChecking = (t: Txn) => t.category === null || t.source === 'ai' || !!t.duplicateOf
