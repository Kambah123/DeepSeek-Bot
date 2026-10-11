import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api'
import { getRepos } from '@/lib/db'
import { verifyWebhookSignature, handleWebhook } from '@/lib/billing/paystack'

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    // Fail closed: an unsigned or mismatched webhook is rejected.
    if (!verifyWebhookSignature(raw, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    let event: unknown
    try {
      event = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const repos = await getRepos()
    await handleWebhook(repos, event)
    return NextResponse.json({ received: true })
  } catch (err) {
    return errorResponse(err)
  }
}
