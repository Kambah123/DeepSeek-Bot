/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pglite ships WASM and must stay external to the server bundle; it is only
  // imported from server-side code (lib/db, route handlers, the worker).
  experimental: {
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
    // Enables instrumentation.ts (Next 14 requires the flag). Used to start the
    // in-process queue worker for the local pglite driver.
    instrumentationHook: true,
  },
  // Keep server secrets out of the client bundle. Anything not prefixed
  // NEXT_PUBLIC_ is server-only by default; this is a belt-and-braces guard.
  env: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none';",
          },
        ],
      },
    ]
  },
}

export default nextConfig
