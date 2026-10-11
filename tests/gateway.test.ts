import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getModelGateway, computeCost, estimateTokens, _resetGateway, type ModelRequest } from '../lib/gateway/gateway.ts'

test('mock provider returns a coherent, role-aware deliverable (no network)', async () => {
  _resetGateway()
  const gw = getModelGateway()
  const req: ModelRequest = {
    model: 'mock',
    messages: [
      { role: 'system', content: '# Your identity\nYou are Researcher, a Research Analyst.\nResearch rules.' },
      { role: 'user', content: 'Compare two competitor CRMs and summarize.' },
    ],
  }
  const res = await gw.complete(req)
  assert.ok(res.content.length > 80, 'deliverable should be substantive')
  assert.ok(/Research|Compare|Summary|Findings/i.test(res.content), 'should reflect the research role')
  assert.ok(res.tokensIn > 0 && res.tokensOut > 0)
  assert.ok(res.costUsd > 0)
  assert.equal(res.provider, 'mock')
})

test('computeCost uses documented fallback prices and config overrides', () => {
  const c1 = computeCost('deepseek-chat', 1000, 1000)
  assert.ok(c1 > 0)
  // Unknown model falls back to deepseek-chat pricing.
  const c2 = computeCost('mystery-model', 1000, 1000)
  assert.equal(c2, c1)
})

test('estimateTokens is a stable heuristic', () => {
  assert.equal(estimateTokens(''), 0)
  assert.equal(estimateTokens('a'.repeat(400)), 100)
})
