/**
 * Minimal, dependency-free markdown renderer for AI-employee deliverables.
 *
 * Deliberately small: it covers the structures the employees actually produce
 * (headings, bold/italic, inline code, lists, tables, blockquotes, rules and
 * fenced code). Model output is UNTRUSTED, so all text is rendered as React
 * children (auto-escaped) and links are only turned into anchors when they use
 * http(s) — a `javascript:` URL from a model simply renders as text.
 */
import type { ReactNode } from 'react'

const SAFE_URL = /^https?:\/\/[^\s)]+$/i

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-i${i++}`

    if (token.startsWith('**') || token.startsWith('__')) {
      out.push(
        <strong key={key} className="font-semibold text-ink-900">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      out.push(
        <code key={key} className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[0.85em] text-ink-800">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](')
      const label = token.slice(1, split)
      const href = token.slice(split + 2, -1)
      out.push(
        SAFE_URL.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-brand-600 underline">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      )
    } else {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function tableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-')
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block.
    if (/^\s*```/.test(line)) {
      const buffer: string[] = []
      i += 1
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buffer.push(lines[i])
        i += 1
      }
      i += 1 // closing fence
      blocks.push(
        <pre key={`b${key++}`} className="overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs leading-relaxed text-ink-50">
          <code>{buffer.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Table: header row followed by a separator row.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = tableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(tableRow(lines[i]))
        i += 1
      }
      blocks.push(
        <div key={`b${key++}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} className="border-b border-ink-200 pb-2 pr-4 font-medium text-ink-700">
                    {inline(h, `th${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border-b border-ink-100 py-2 pr-4 align-top text-ink-700">
                      {inline(c, `td${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const content = inline(heading[2], `h${key}`)
      if (level === 1) blocks.push(<h2 key={`b${key++}`} className="mt-1 text-lg font-semibold text-ink-900">{content}</h2>)
      else if (level === 2) blocks.push(<h3 key={`b${key++}`} className="mt-4 text-base font-semibold text-ink-900">{content}</h3>)
      else blocks.push(<h4 key={`b${key++}`} className="mt-3 text-sm font-semibold uppercase tracking-wide text-ink-600">{content}</h4>)
      i += 1
      continue
    }

    // Horizontal rule.
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`b${key++}`} className="border-ink-200" />)
      i += 1
      continue
    }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      const buffer: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push(
        <blockquote key={`b${key++}`} className="border-l-2 border-ink-300 bg-ink-50 py-2 pl-3 text-sm text-ink-600">
          {inline(buffer.join(' '), `q${key}`)}
        </blockquote>,
      )
      continue
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`b${key++}`} className="list-disc space-y-1 pl-5 text-sm text-ink-700">
          {items.map((it, ii) => (
            <li key={ii}>{inline(it, `li${ii}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Ordered list.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`b${key++}`} className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
          {items.map((it, ii) => (
            <li key={ii}>{inline(it, `on${ii}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // Blank line.
    if (line.trim() === '') {
      i += 1
      continue
    }

    // Paragraph: join until a blank line or the start of another block.
    const buffer: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*(```|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      buffer.push(lines[i].trim())
      i += 1
    }
    blocks.push(
      <p key={`b${key++}`} className="text-sm leading-relaxed text-ink-700">
        {inline(buffer.join(' '), `p${key}`)}
      </p>,
    )
  }

  return <div className="space-y-3">{blocks}</div>
}
