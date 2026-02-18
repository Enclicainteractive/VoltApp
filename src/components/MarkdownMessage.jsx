import React, { useMemo } from 'react'
import InviteEmbed from './InviteEmbed'
import '../assets/styles/MarkdownMessage.css'

const URL_REGEX = /(https?:\/\/[^\s]+)/g
const INVITE_URL_REGEX = /https?:\/\/[^\s]*\/invite\/([a-zA-Z0-9_-]+)/g

const BOLD_REGEX = /\*\*([^*]+)\*\*/g
const ITALIC_REGEX = /(?:^|[^*])\*([^*]+)\*(?:[^*]|$)|_([^_]+)_/g
const CODE_REGEX = /`([^`\n]+)`/g
const CODE_BLOCK_REGEX = /```(\w*)\n?([\s\S]*?)```/g
const SPOILER_REGEX = /\|\|(.+?)\|\|/g
const STRIKETHROUGH_REGEX = /~~(.+?)~~/g

const LANGUAGES = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  ruby: 'ruby',
  go: 'go',
  rust: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  php: 'php',
  html: 'html',
  css: 'css',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  md: 'markdown',
  markdown: 'markdown',
  text: 'plaintext',
  txt: 'plaintext'
}

const MarkdownMessage = ({ content }) => {
  if (!content) return null

  const inviteEmbeds = useMemo(() => {
    const embeds = []
    const seen = new Set()
    let match
    const regex = new RegExp(INVITE_URL_REGEX.source, 'g')
    while ((match = regex.exec(content)) !== null) {
      const code = match[1]
      if (!seen.has(code)) {
        seen.add(code)
        embeds.push({ code, url: match[0] })
      }
    }
    return embeds
  }, [content])

  let processedContent = content

  const codeBlocks = []
  processedContent = processedContent.replace(CODE_BLOCK_REGEX, (match, lang, code) => {
    const id = `__CODEBLOCK${codeBlocks.length}__`
    const language = LANGUAGES[lang?.toLowerCase()] || 'plaintext'
    codeBlocks.push({ id, code: code.trim(), language })
    return id
  })

  const inlineCodes = []
  processedContent = processedContent.replace(CODE_REGEX, (match, code) => {
    const id = `__INLINE${inlineCodes.length}__`
    inlineCodes.push({ id, code })
    return id
  })

  processedContent = processedContent.replace(BOLD_REGEX, '<strong>$1</strong>')
  
  processedContent = processedContent.replace(ITALIC_REGEX, (match, p1, p2) => {
    return `<em>${p1 || p2 || ''}</em>`
  })
  
  processedContent = processedContent.replace(STRIKETHROUGH_REGEX, '<del>$1</del>')
  
  processedContent = processedContent.replace(SPOILER_REGEX, '<span class="spoiler">$1</span>')

  const urls = []
  processedContent = processedContent.replace(URL_REGEX, (match, url) => {
    const id = `__URL${urls.length}__`
    urls.push({ id, url })
    return id
  })

  codeBlocks.forEach(({ id, code, language }) => {
    processedContent = processedContent.replace(
      id,
      `<pre class="code-block" data-language="${language}"><code class="language-${language}">${escapeHtml(code)}</code></pre>`
    )
  })

  inlineCodes.forEach(({ id, code }) => {
    processedContent = processedContent.replace(
      id,
      `<code class="inline-code">${escapeHtml(code)}</code>`
    )
  })

  urls.forEach(({ id, url }) => {
    processedContent = processedContent.replace(
      id,
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="markdown-link">${url}</a>`
    )
  })

  processedContent = processedContent.replace(/\n/g, '<br />')

  return (
    <>
      <span 
        className="markdown-message"
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
      {inviteEmbeds.map(({ code, url }) => (
        <InviteEmbed key={code} inviteCode={code} inviteUrl={url} />
      ))}
    </>
  )
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

export default MarkdownMessage
