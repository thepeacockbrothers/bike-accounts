import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/store'
import { Wheel } from './icons'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError("That email and password didn't work. Try again.")
    setBusy(false)
  }

  return (
    <form className="login" onSubmit={submit}>
      <Wheel />
      <h1>Bike Accounts</h1>
      <label className="field">
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <div className="note error">{error}</div>}
      <button className="primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
