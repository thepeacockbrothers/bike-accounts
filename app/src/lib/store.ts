import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Rule, Txn } from './types'

/** Where transactions and remembered payees live. Supabase syncs phone + computer; local is for trying it out. */
export interface Store {
  readonly synced: boolean
  load(): Promise<{ txns: Txn[]; rules: Rule[] }>
  saveTxns(txns: Txn[]): Promise<void>
  deleteTxns(ids: string[]): Promise<void>
  saveRule(rule: Rule): Promise<void>
  saveRules(rules: Rule[]): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

// --- Supabase -------------------------------------------------------------

interface TxnRow {
  id: string
  date: string
  description: string
  amount: number
  category: string | null
  source: string | null
  import_id: string
  duplicate_of: string | null
}

const toRow = (t: Txn): TxnRow => ({
  id: t.id,
  date: t.date,
  description: t.description,
  amount: t.amount,
  category: t.category,
  source: t.source,
  import_id: t.importId,
  duplicate_of: t.duplicateOf ?? null,
})

const fromRow = (r: TxnRow): Txn => ({
  id: r.id,
  date: r.date,
  description: r.description,
  amount: Number(r.amount),
  category: r.category as Txn['category'],
  source: r.source as Txn['source'],
  importId: r.import_id,
  ...(r.duplicate_of ? { duplicateOf: r.duplicate_of } : {}),
})

class SupabaseStore implements Store {
  readonly synced = true
  private db: SupabaseClient
  constructor(db: SupabaseClient) {
    this.db = db
  }

  async load() {
    const txns: Txn[] = []
    // Supabase returns at most 1000 rows per request.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from('transactions').select('*').order('date').range(from, from + 999)
      if (error) throw error
      txns.push(...(data as TxnRow[]).map(fromRow))
      if (data.length < 1000) break
    }
    const { data: rules, error } = await this.db.from('rules').select('pattern, category')
    if (error) throw error
    return { txns, rules: rules as Rule[] }
  }

  async saveTxns(txns: Txn[]) {
    for (let i = 0; i < txns.length; i += 500) {
      const { error } = await this.db.from('transactions').upsert(txns.slice(i, i + 500).map(toRow))
      if (error) throw error
    }
  }

  async deleteTxns(ids: string[]) {
    const { error } = await this.db.from('transactions').delete().in('id', ids)
    if (error) throw error
  }

  async saveRule(rule: Rule) {
    await this.saveRules([rule])
  }

  async saveRules(rules: Rule[]) {
    for (let i = 0; i < rules.length; i += 500) {
      const { error } = await this.db.from('rules').upsert(rules.slice(i, i + 500))
      if (error) throw error
    }
  }
}

// --- This device only -----------------------------------------------------

const LOCAL_KEY = 'mbm.data'

class LocalStore implements Store {
  readonly synced = false
  private read(): { txns: Txn[]; rules: Rule[] } {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '') as { txns: Txn[]; rules: Rule[] }
    } catch {
      return { txns: [], rules: [] }
    }
  }
  private write(data: { txns: Txn[]; rules: Rule[] }) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data))
  }
  async load() {
    return this.read()
  }
  async saveTxns(txns: Txn[]) {
    const data = this.read()
    const byId = new Map(data.txns.map((t) => [t.id, t]))
    for (const t of txns) byId.set(t.id, t)
    this.write({ ...data, txns: [...byId.values()] })
  }
  async deleteTxns(ids: string[]) {
    const drop = new Set(ids)
    const data = this.read()
    this.write({ ...data, txns: data.txns.filter((t) => !drop.has(t.id)) })
  }
  async saveRule(rule: Rule) {
    await this.saveRules([rule])
  }
  async saveRules(rules: Rule[]) {
    const data = this.read()
    const byPattern = new Map(data.rules.map((r) => [r.pattern, r]))
    for (const r of rules) byPattern.set(r.pattern, r)
    this.write({ ...data, rules: [...byPattern.values()] })
  }
}

export const store: Store = supabase ? new SupabaseStore(supabase) : new LocalStore()
