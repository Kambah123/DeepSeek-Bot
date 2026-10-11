/**
 * Secret scrubbing.
 *
 * Adapted from ds-bot/src/host/memory.js (Apache-2.0, DeepSeek-Bot). The
 * upstream keeps credentials out of bot memory; we reuse the same detection
 * patterns to keep secrets out of model context, logs, and stored tool output.
 *
 * Treat uploaded files, retrieved pages, and tool output as untrusted: before
 * any of it is persisted or forwarded to a model, run it through `scrubSecrets`.
 */

const KEY_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\bhf_[A-Za-z0-9]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /\bAKIA[0-9A-Z]{16}\b/,
]

// A long unbroken run of mixed-case letters, digits and a few symbols, outside a
// URL — a heuristic for ad-hoc secrets/tokens that don't match a known prefix.
function hasLongSecretRun(text: string): boolean {
  const bare = text.replace(/\bhttps?:\/\/\S+/g, ' ')
  return (bare.match(/[A-Za-z0-9+=]{32,}/g) ?? []).some(
    (run) => /[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run),
  )
}

export function looksLikeSecret(text: string): boolean {
  if (!text) return false
  if (KEY_PATTERNS.some((p) => p.test(text))) return true
  return hasLongSecretRun(text)
}

const REDACTED = '███REDACTED███'

/** Replace detected secrets with a fixed redaction marker. The marker itself is
 *  inert and cannot be reversed. */
export function scrubSecrets(text: string): string {
  if (!text) return text
  let out = text
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, REDACTED)
  }
  // Redact long bare runs that look like secrets.
  out = out.replace(/[A-Za-z0-9+=]{32,}/g, (run) => {
    if (/[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run)) return REDACTED
    return run
  })
  return out
}

/** Redact secrets from an arbitrary JSON-serializable value (deep). */
export function scrubSecretsDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubSecrets(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => scrubSecretsDeep(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubSecretsDeep(v)
    }
    return out as T
  }
  return value
}
