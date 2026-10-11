'use client'
/** Create an AI employee from a built-in template. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field } from './ui'

export interface TemplateOption {
  id: string
  name: string
  role: string
  description: string
}

export function EmployeeForm({ templates, models }: { templates: TemplateOption[]; models: string[] }) {
  const router = useRouter()
  const [template, setTemplate] = useState(templates[0]?.id ?? '')
  const [name, setName] = useState(templates[0]?.name ?? '')
  const [model, setModel] = useState(models[0] ?? '')
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = templates.find((t) => t.id === template)

  function chooseTemplate(id: string) {
    setTemplate(id)
    const t = templates.find((x) => x.id === id)
    // Only overwrite the name if the user has not customised it.
    if (t && (!name || templates.some((x) => x.name === name))) setName(t.name)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        template,
        name,
        model,
        instructions: instructions.trim() || undefined,
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error?.message ?? 'Could not create the employee')
      setBusy(false)
      return
    }
    router.push(`/dashboard/employees/${data.employee.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <Field label="Role template" hint={selected?.description}>
        <select className="input" value={template} onChange={(e) => chooseTemplate(e.target.value)} required>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Name" hint="What you'll call this employee in the workspace.">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="e.g. Ada" />
      </Field>

      <Field label="Model" hint="Models available on your plan. The platform provides model access.">
        <select className="input" value={model} onChange={(e) => setModel(e.target.value)} required>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Custom instructions (optional)" hint="Leave blank to use the template's instructions.">
        <textarea
          className="input min-h-[96px]"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={4000}
          placeholder="Anything specific about how this employee should work…"
        />
      </Field>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create employee'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.back()} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
