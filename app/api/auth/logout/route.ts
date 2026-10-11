import { errorResponse } from '@/lib/api'
import { clearAuthCookies } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const res = NextResponse.json({ ok: true })
    clearAuthCookies(res)
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
