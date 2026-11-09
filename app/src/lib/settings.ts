import type { Txn } from './types'

export const BUSINESS_NAME_KEY = 'mbm.businessName'
export const businessName = () => localStorage.getItem(BUSINESS_NAME_KEY) || 'Mobile Bike Man'

/** Loaded on demand: the spreadsheet library is large and only needed for exports. */
export async function downloadSpreadsheet(txns: Txn[], year: number) {
  const { exportForAccountant } = await import('./export')
  exportForAccountant(txns, year, businessName())
}

const KEY_STORAGE = 'mbm.anthropicKey'
/** Claude API key, kept on this device only. */
export const getApiKey = () => localStorage.getItem(KEY_STORAGE) ?? ''
export const setApiKey = (k: string) =>
  k ? localStorage.setItem(KEY_STORAGE, k.trim()) : localStorage.removeItem(KEY_STORAGE)
