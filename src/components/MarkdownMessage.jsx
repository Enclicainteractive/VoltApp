import React, { useState, useCallback } from 'react'
import InviteEmbed from './InviteEmbed'
import '../assets/styles/MarkdownMessage.css'

// ─── Language map for syntax highlighting labels ───────────────────────────
const LANGUAGES = {
  js: 'javascript', javascript: 'javascript',
  ts: 'typescript', typescript: 'typescript',
  jsx: 'jsx', tsx: 'tsx',
  py: 'python', python: 'python',
  rb: 'ruby', ruby: 'ruby',
  go: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java',
  kt: 'kotlin', kotlin: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp', 'c++': 'cpp',
  cs: 'csharp', 'c#': 'csharp',
  php: 'php',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml', yml: 'yaml',
  sql: 'sql',
  sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash',
  ps: 'powershell', powershell: 'powershell',
  md: 'markdown', markdown: 'markdown',
  diff: 'diff',
  text: 'plaintext', txt: 'plaintext',
  plaintext: 'plaintext',
}

// ─── Escape HTML for safe insertion ───────────────────────────────────────
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ─── Spoiler component (click to reveal) ──────────────────────────────────
const Spoiler = ({ children }) => {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      className={`spoiler${revealed ? ' revealed' : ''}`}
      onClick={() => setRevealed(r => !r)}
      title={revealed ? 'Click to hide' : 'Click to reveal spoiler'}
    >
      {children}
    </span>
  )
}

// ─── Inline code component ─────────────────────────────────────────────────
const InlineCode = ({ code }) => (
  <code className="inline-code">{code}</code>
)

// ─── Code block component ──────────────────────────────────────────────────
const CodeBlock = ({ code, language }) => {
  const [copied, setCopied] = useState(false)
  const langLabel = language !== 'plaintext' ? language : ''

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code])

  return (
    <div className={`code-block-wrapper${langLabel ? ' has-lang' : ''}`}>
      {langLabel && <div className="code-block-header"><span className="code-lang-label">{langLabel}</span></div>}
      <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre className={`code-block language-${language}`} data-language={language}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ─── Core inline parser ────────────────────────────────────────────────────
// Returns an array of React nodes from a plain-text string.
// Handles: bold, italic, underline, strikethrough, spoiler, inline code, links, @mentions
function parseInline(text, key = 0, mentionProps = {}) {
  if (!text) return []

  const { currentUserId, mentions } = mentionProps

  // Ordered patterns — most specific first.
  // Groups: (fullmatch-content per pattern)
  const patterns = [
    // inline code — must come before everything else so backtick content is never parsed
    { re: /`([^`]+)`/, type: 'code' },
    // bold+italic combined ***text***
    { re: /\*\*\*(.+?)\*\*\*/, type: 'bolditalic' },
    // bold **text**
    { re: /\*\*(.+?)\*\*/, type: 'bold' },
    // italic *text* (not adjacent to *)
    { re: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/, type: 'italic' },
    // italic _text_ (not adjacent to _)
    { re: /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/, type: 'italic' },
    // underline __text__
    { re: /__(.+?)__/, type: 'underline' },
    // strikethrough ~~text~~
    { re: /~~(.+?)~~/, type: 'strike' },
    // spoiler ||text||
    { re: /\|\|(.+?)\|\|/, type: 'spoiler' },
    // @mention — supports @username:host (federated) and @username (local/special)
    { re: /(@(?:everyone|here|[a-zA-Z0-9_\-.]+(?::[a-zA-Z0-9_\-.]+)?))/, type: 'mention' },
    // URL
    { re: /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/, type: 'url' },
  ]

  const nodes = []
  let remaining = text
  let nodeKey = key * 10000

  outer: while (remaining.length > 0) {
    let earliest = null
    let earliestIndex = Infinity

    for (const { re, type } of patterns) {
      const m = re.exec(remaining)
      if (m && m.index < earliestIndex) {
        earliest = { match: m, type }
        earliestIndex = m.index
      }
    }

    if (!earliest) {
      nodes.push(remaining)
      break
    }

    // Text before match
    if (earliestIndex > 0) {
      nodes.push(remaining.slice(0, earliestIndex))
    }

    const { match, type } = earliest
    const content = match[1]
    nodeKey++

    switch (type) {
      case 'code':
        nodes.push(<InlineCode key={nodeKey} code={content} />)
        break
      case 'bolditalic':
        nodes.push(<strong key={nodeKey}><em>{parseInline(content, nodeKey, mentionProps)}</em></strong>)
        break
      case 'bold':
        nodes.push(<strong key={nodeKey}>{parseInline(content, nodeKey, mentionProps)}</strong>)
        break
      case 'italic':
        nodes.push(<em key={nodeKey}>{parseInline(content, nodeKey, mentionProps)}</em>)
        break
      case 'underline':
        nodes.push(<span key={nodeKey} className="md-underline">{parseInline(content, nodeKey, mentionProps)}</span>)
        break
      case 'strike':
        nodes.push(<del key={nodeKey}>{parseInline(content, nodeKey, mentionProps)}</del>)
        break
      case 'spoiler':
        nodes.push(<Spoiler key={nodeKey}>{parseInline(content, nodeKey, mentionProps)}</Spoiler>)
        break
      case 'mention': {
        // raw may be @username:host or @username or @everyone/@here
        const raw = content
        const withoutAt = raw.slice(1) // strip leading @
        // Split username and optional host
        const colonIdx = withoutAt.indexOf(':')
        const username = colonIdx !== -1 ? withoutAt.slice(0, colonIdx) : withoutAt
        const host = colonIdx !== -1 ? withoutAt.slice(colonIdx + 1) : null
        const nameLower = username.toLowerCase()
        const isEveryone = nameLower === 'everyone'
        const isHere = nameLower === 'here'
        const isDirectMention =
          (mentions?.users && currentUserId && mentions.users.includes(currentUserId)) ||
          (mentions?.usernames && mentions.usernames.some(u => u.toLowerCase() === nameLower))

        // Display text: always @username (never show :host to the user)
        const displayText = `@${username}`
        // Title tooltip: show full federated id if cross-server
        const federatedId = host ? `@${username}:${host}` : `@${username}`

        let cls = 'mention-other'
        let title = federatedId
        if (isEveryone) { cls = 'mention-highlight mention-everyone'; title = 'Mentions everyone' }
        else if (isHere) { cls = 'mention-highlight mention-here'; title = 'Mentions online members' }
        else if (isDirectMention) { cls = `mention-highlight mention-user`; title = `You were mentioned (${federatedId})` }

        // Look up userId from members list for click-to-profile
        const member = mentionProps.members?.find(
          m => m.username?.toLowerCase() === nameLower
        )
        const handleClick = mentionProps.onMentionClick
          ? () => mentionProps.onMentionClick(member?.id || null, username, host)
          : undefined

        nodes.push(
          <span
            key={nodeKey}
            className={`${cls}${handleClick ? ' mention-clickable' : ''}`}
            title={title}
            onClick={handleClick}
            style={handleClick ? { cursor: 'pointer' } : undefined}
          >
            {displayText}
          </span>
        )
        break
      }
      case 'url': {
        const url = content
        nodes.push(
          <a key={nodeKey} href={url} target="_blank" rel="noopener noreferrer" className="markdown-link">
            {url}
          </a>
        )
        break
      }
      default:
        nodes.push(content)
    }

    remaining = remaining.slice(earliestIndex + match[0].length)
  }

  return nodes
}

// ─── Block-level parser ────────────────────────────────────────────────────
// Splits content into block-level nodes, then delegates inline parsing
function parseBlocks(content, mentionProps = {}) {
  if (!content) return []

  const nodes = []
  // Split into lines preserving \n
  const lines = content.split('\n')
  let i = 0
  let blockKey = 0

  const nextKey = () => ++blockKey

  while (i < lines.length) {
    const line = lines[i]

    // ── Fenced code block ```lang
    if (line.trimStart().startsWith('```')) {
      const fence = line.trimStart().match(/^```(\w*)/)
      const rawLang = fence?.[1]?.toLowerCase() || ''
      const language = LANGUAGES[rawLang] || (rawLang ? rawLang : 'plaintext')
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // consume closing ```
      const code = codeLines.join('\n')
      nodes.push(<CodeBlock key={nextKey()} code={code} language={language} />)
      continue
    }

    // ── Blockquote > text (consecutive lines)
    if (/^> /.test(line) || line === '>') {
      const quoteLines = []
      while (i < lines.length && (/^> /.test(lines[i]) || lines[i] === '>')) {
        quoteLines.push(lines[i].replace(/^> ?/, ''))
        i++
      }
      const quoteContent = quoteLines.join('\n')
      nodes.push(
        <blockquote key={nextKey()} className="md-blockquote">
          {parseBlocks(quoteContent, mentionProps)}
        </blockquote>
      )
      continue
    }

    // ── Headers # ## ###
    const headerMatch = line.match(/^(#{1,3}) (.+)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const text = headerMatch[2]
      const Tag = `h${level}`
      nodes.push(
        <Tag key={nextKey()} className={`md-h${level}`}>
          {parseInline(text, nextKey(), mentionProps)}
        </Tag>
      )
      i++
      continue
    }

    // ── Unordered list (- or * or +)
    if (/^[ \t]*[-*+] /.test(line)) {
      const listItems = []
      while (i < lines.length && /^[ \t]*[-*+] /.test(lines[i])) {
        const itemText = lines[i].replace(/^[ \t]*[-*+] /, '')
        listItems.push(
          <li key={listItems.length}>{parseInline(itemText, listItems.length, mentionProps)}</li>
        )
        i++
      }
      nodes.push(<ul key={nextKey()} className="md-list">{listItems}</ul>)
      continue
    }

    // ── Ordered list 1. 2.
    if (/^[ \t]*\d+\. /.test(line)) {
      const listItems = []
      while (i < lines.length && /^[ \t]*\d+\. /.test(lines[i])) {
        const itemText = lines[i].replace(/^[ \t]*\d+\. /, '')
        listItems.push(
          <li key={listItems.length}>{parseInline(itemText, listItems.length, mentionProps)}</li>
        )
        i++
      }
      nodes.push(<ol key={nextKey()} className="md-list">{listItems}</ol>)
      continue
    }

    // ── Horizontal rule ---
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={nextKey()} className="md-hr" />)
      i++
      continue
    }

    // ── Blank line → paragraph break (just spacing, Discord doesn't wrap in <p>)
    if (line.trim() === '') {
      // Emit a line break only if it's between content (not at start/end)
      if (nodes.length > 0) {
        nodes.push(<br key={nextKey()} />)
      }
      i++
      continue
    }

    // ── Regular line → inline content
    const inlineNodes = parseInline(line, nextKey(), mentionProps)
    nodes.push(...inlineNodes.map((n, idx) =>
      typeof n === 'string' ? n : React.cloneElement(n, { key: `${nextKey()}-${idx}` })
    ))
    // Add line break unless this is the last line
    if (i < lines.length - 1) {
      nodes.push(<br key={nextKey()} />)
    }
    i++
  }

  return nodes
}

// ─── Invite embed extractor ────────────────────────────────────────────────
const INVITE_URL_RE = /https?:\/\/[^\s]*\/invite\/([a-zA-Z0-9_-]+)/g

function extractInvites(content) {
  const embeds = []
  const seen = new Set()
  let m
  const re = new RegExp(INVITE_URL_RE.source, 'g')
  while ((m = re.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      embeds.push({ code: m[1], url: m[0] })
    }
  }
  return embeds
}

// ─── GIF embed extractor ───────────────────────────────────────────────────
// Matches [GIF: https://...] anywhere in the message content
const GIF_TAG_RE = /\[GIF:\s*(https?:\/\/[^\]\s]+)\]/g

const GifEmbed = ({ url }) => {
  const [errored, setErrored] = useState(false)
  if (errored) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="markdown-link gif-fallback-link">
        {url}
      </a>
    )
  }
  return (
    <div className="gif-embed">
      <img
        src={url}
        alt="GIF"
        className="gif-embed-img"
        onError={() => setErrored(true)}
        loading="lazy"
      />
    </div>
  )
}

function splitGifs(content) {
  // Returns alternating text and gif-url segments
  const parts = []
  let last = 0
  let m
  const re = new RegExp(GIF_TAG_RE.source, 'g')
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: content.slice(last, m.index) })
    parts.push({ type: 'gif', url: m[1] })
    last = m.index + m[0].length
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) })
  return parts
}

// ─── Main component ────────────────────────────────────────────────────────
/**
 * MarkdownMessage
 *
 * Props:
 *   content          string    — raw message text
 *   currentUserId    string    — logged-in user's ID (for mention highlighting)
 *   mentions         object    — { users: string[], usernames: string[] }
 *   members          array     — server member list (for mention click-to-profile lookup)
 *   onMentionClick   function  — (userId, username, host) called when a mention is clicked
 */
const MarkdownMessage = ({ content, currentUserId, mentions, members, onMentionClick }) => {
  if (!content) return null

  const mentionProps = { currentUserId, mentions, members, onMentionClick }
  const invites = extractInvites(content)

  // Split content on [GIF: url] tags so we render text + gif embeds in order
  const gifParts = splitGifs(content)
  const hasGifs = gifParts.some(p => p.type === 'gif')

  return (
    <span className="markdown-message">
      {hasGifs ? (
        <>
          {gifParts.map((part, i) =>
            part.type === 'gif'
              ? <GifEmbed key={i} url={part.url} />
              : part.value
                ? <span key={i}>{parseBlocks(part.value, mentionProps)}</span>
                : null
          )}
        </>
      ) : (
        parseBlocks(content, mentionProps)
      )}
      {invites.map(({ code, url }) => (
        <InviteEmbed key={code} inviteCode={code} inviteUrl={url} />
      ))}
    </span>
  )
}

export default MarkdownMessage
