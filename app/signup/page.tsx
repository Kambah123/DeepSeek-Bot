'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName, email, password, orgName }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data?.error?.message ?? 'Sign-up failed')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600" />
          <span className="text-lg font-semibold">AI Employees</span>
        </Link>
        <div className="card p-8">
          <h1 className="text-xl font-semibold">Create your workspace</h1>
          <p className="mt-1 text-sm text-ink-600">Start with a free trial and your first AI employee.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label">Your name</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <label className="label">Company name</label>
              <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="Acme Inc" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <p className="mt-1 text-xs text-ink-500">At least 8 characters.</p>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? 'Creating…' : 'Create workspace'}</button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-600">
            Already have an account? <Link href="/login" className="font-medium text-brand-600">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
