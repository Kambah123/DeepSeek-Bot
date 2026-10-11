import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrubSecrets, looksLikeSecret } from '../lib/secrets/scrub.ts'
import { buildSystemPrompt } from '../lib/agents/templates.ts'

test('secret scrubbing redacts known credential formats', () => {
  assert.ok(looksLikeSecret('sk-abcdefghijklmnopqrstuvwx'))
  assert.ok(looksLikeSecret('AKIA1234567890ABCDEF'))
  assert.ok(looksLikeSecret('AIzaSyA1234567890abcdefghijklmnopqrstuv'))
  assert.ok(looksLikeSecret('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'))

  const dirty = 'Here is the key sk-abcdefghijklmnopqrstuvwx and token AKIA1234567890ABCDEF'
  const clean = scrubSecrets(dirty)
  assert.ok(!clean.includes('sk-abcdefghijklmnopqrstuvwx'))
  assert.ok(!clean.includes('AKIA1234567890ABCDEF'))
  assert.ok(clean.includes('Here is the key'))
})

test('secret scrubbing does not corrupt ordinary text', () => {
  const text = 'Please summarize the Q3 report for our customer Acme Corp.'
  assert.equal(scrubSecrets(text), text)
})

test('employee system prompt warns against prompt injection and untrusted content', () => {
  const prompt = buildSystemPrompt({
    name: 'Researcher', role: 'Research Analyst', instructions: 'Be thorough.', toolPolicy: { allow: [] },
  })
  assert.ok(/UNTRUSTED/i.test(prompt), 'must treat retrieved content as untrusted')
  assert.ok(/prompt-injection/i.test(prompt), 'must defend against prompt injection')
  assert.ok(/operating system|shell/i.test(prompt), 'must deny OS/shell access by default')
})
