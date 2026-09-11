import type { ReactNode } from 'react'

/**
 * A small, deliberately restricted Markdown renderer for Jumbo's answers.
 *
 * It builds React elements directly — there is no dangerouslySetInnerHTML
 * anywhere, so nothing the model writes can become markup. Anything outside
 * the subset below renders as the plain text it is.
 *
 * Supported: headings, paragraphs, bullet and numbered lists, simple tables,
 * bold, italic and inline code. Deliberately not supported: raw HTML, images,
 * links, code fences — an answer about someone's own health data has no use
 * for them, and each is a way for a model to put something on screen that
 * Jumbo did not design.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="md">{blocks(text)}</div>
}

function blocks(src: string): ReactNode[] {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0

  const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l)
  const isNumber = (l: string) => /^\s*\d+[.)]\s+/.test(l)
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
  const isDivider = (l: string) => /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(l)

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i += 1; continue }

    // Heading. Any depth collapses to two visual levels; an answer in a
    // conversation does not need six. "###" is what a model reaches for
    // most often, so it is the primary one.
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length <= 3 ? 3 : 4
      const Tag = (level === 3 ? 'h3' : 'h4') as 'h3' | 'h4'
      out.push(<Tag key={key++} className={`md__h${level}`}>{inline(h[2])}</Tag>)
      i += 1
      continue
    }

    // Table: a header row, a divider, then body rows.
    if (isTableRow(line) && isTableRow(lines[i + 1] ?? '') && isDivider(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(line)
      const body: string[][] = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) { body.push(cells(lines[i])); i += 1 }
      out.push(
        <div className="md__table-wrap" key={key++}>
          <table className="md__table">
            <thead>
              <tr>{head.map((c, j) => <th key={j} scope="col">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>{row.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Lists.
    if (isBullet(line) || isNumber(line)) {
      const ordered = isNumber(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? isNumber(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/, ''))
        i += 1
      }
      const Tag = (ordered ? 'ol' : 'ul') as 'ol' | 'ul'
      out.push(
        <Tag key={key++} className={ordered ? 'md__ol' : 'md__ul'}>
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </Tag>,
      )
      continue
    }

    // Paragraph: everything up to the next blank line or block start.
    const para: string[] = []
    while (
      i < lines.length && lines[i].trim()
      && !/^\s*#{1,6}\s/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])
      && !isTableRow(lines[i])
    ) {
      para.push(lines[i].trim())
      i += 1
    }
    if (para.length) out.push(<p key={key++} className="md__p">{inline(para.join(' '))}</p>)
  }

  return out
}

/** Bold, italic and inline code, in one pass so nesting cannot run away. */
function inline(src: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index))
    if (m[2] !== undefined) out.push(<strong key={key++}>{m[2]}</strong>)
    else if (m[4] !== undefined) out.push(<em key={key++}>{m[4]}</em>)
    else if (m[5] !== undefined) out.push(<code key={key++} className="md__code">{m[5]}</code>)
    last = re.lastIndex
  }
  if (last < src.length) out.push(src.slice(last))
  return out
}
