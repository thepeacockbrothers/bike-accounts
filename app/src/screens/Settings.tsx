import { useState } from 'react'
import { BUSINESS_NAME_KEY, businessName, getApiKey, setApiKey } from '../lib/settings'
import { store, supabase } from '../lib/store'

export default function Settings({ txnCount }: { txnCount: number }) {
  const [name, setName] = useState(businessName())
  const [key, setKey] = useState(getApiKey())
  const [saved, setSaved] = useState(false)

  function save() {
    localStorage.setItem(BUSINESS_NAME_KEY, name.trim())
    setApiKey(key)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section>
      <h1>Settings</h1>

      <label className="field">
        Business name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        Claude API key <span className="hint">(optional)</span>
        <input
          type="password"
          autoComplete="off"
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <span className="hint">
          When set, payments the app doesn't recognise are sent to Claude for a suggested category (just the description
          and amount — never account details). Stored only on this device.
        </span>
      </label>

      <button className="primary" onClick={save}>
        {saved ? 'Saved' : 'Save'}
      </button>

            <p className="hint">
        {store.synced
          ? `${txnCount} payments, synced between your devices.`
          : `${txnCount} payments, saved on this device only.`}
      </p>
      {supabase && (
        <button className="secondary" onClick={() => supabase!.auth.signOut()}>
          Sign out
        </button>
      )}
    </section>
  )
}
