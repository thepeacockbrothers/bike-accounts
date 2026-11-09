import Anthropic from '@anthropic-ai/sdk'
import { CATEGORIES, isCategoryId } from './categories'
import { getApiKey } from './settings'
import type { Txn } from './types'

const SYSTEM = `You categorise bank transactions for a UK sole trader who runs a mobile bicycle repair business (travels to customers in a van, buys bike parts, uses a card machine).

Pick exactly one category id per transaction:
${CATEGORIES.map((c) => `- ${c.id}: ${c.label} — ${c.hint}`).join('\n')}

Guidance:
- Negative amounts are money out, positive are money in.
- Use "personal" for things that are clearly not for the business (groceries, takeaways, entertainment, clothes that aren't workwear).
- Use "transfer" for payments to HMRC and moves between the owner's own accounts.
- If you genuinely can't tell, use null rather than guessing.`

/**
 * Asks Claude to categorise transactions the rules couldn't. Only the description and
 * amount are sent — never account numbers. Returns id -> category for the ones it was sure of.
 */
export async function aiCategorise(txns: Txn[]): Promise<Map<string, Txn['category']>> {
  const apiKey = getApiKey()
  const result = new Map<string, Txn['category']>()
  if (!apiKey || txns.length === 0) return result

  // The key is typed in on his own device; it never ships in the app's code.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  for (let i = 0; i < txns.length; i += 80) {
    const batch = txns.slice(i, i + 80)
    const lines = batch.map((t, n) => `${n}\t${t.amount.toFixed(2)}\t${t.description}`).join('\n')
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer' },
                    category: { anyOf: [{ type: 'string', enum: CATEGORIES.map((c) => c.id) }, { type: 'null' }] },
                  },
                  required: ['index', 'category'],
                  additionalProperties: false,
                },
              },
            },
            required: ['results'],
            additionalProperties: false,
          },
        },
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: `index\tamount (£)\tdescription\n${lines}` }],
    })
    if (response.stop_reason !== 'end_turn') continue // refusal or cut off: leave these for him to check
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const parsed = JSON.parse(text) as { results: { index: number; category: string | null }[] }
    for (const r of parsed.results) {
      const t = batch[r.index]
      if (t && isCategoryId(r.category)) result.set(t.id, r.category)
    }
  }
  return result
}
