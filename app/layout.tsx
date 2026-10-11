import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Employees — your team of AI workers',
  description: 'A multi-tenant SaaS that gives businesses AI employees to do real work.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-50 text-ink-900 antialiased">{children}</body>
    </html>
  )
}
