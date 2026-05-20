import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { aiSummary } from '../api/ai'
import { useEscClose } from './Toast'

// Renders text with **bold**, *italic*, and paragraph breaks as React elements
function renderMarkdown(text) {
  if (!text) return null
  return text.split(/\n\n+/).map((para, pi) => {
    if (!para.trim()) return null
    const segments = []
    const regex = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
    let last = 0, key = 0, match
    while ((match = regex.exec(para)) !== null) {
      if (match.index > last) segments.push(para.slice(last, match.index))
      if (match[1]) segments.push(<strong key={key++}><em>{match[1]}</em></strong>)
      else if (match[2]) segments.push(<strong key={key++}>{match[2]}</strong>)
      else if (match[3]) segments.push(<em key={key++}>{match[3]}</em>)
      else if (match[4]) segments.push(<code key={key++} className="ai-inline-code">{match[4]}</code>)
      last = match.index + match[0].length
    }
    if (last < para.length) segments.push(para.slice(last))
    // Check if it's a heading-like line (starts with number + dot or "Actionable")
    const isCallout = /^(\*\*)?actionable/i.test(para.trim())
    return (
      <p key={pi} className={`ai-summary-para${isCallout ? ' ai-summary-callout' : ''}`}>
        {segments}
      </p>
    )
  })
}

export default function AiSummaryModal({ filters = {}, onClose }) {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  useEscClose(onClose)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await aiSummary(filters)
      setSummary(data.summary || '')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  return createPortal(
    <div className="cs-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cs-panel ai-summary-modal" role="dialog" aria-modal="true">
        <div className="cs-header">
          <span className="cs-title">✨ AI Executive Summary</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={load} disabled={loading} title="Regenerate">↺</button>
            <button className="bp-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="cs-body ai-summary-body">
          {loading && <div className="ai-insights-loading"><span className="ai-spinner">⟳</span> Generating summary…</div>}
          {error && <div className="ai-insights-error">⚠ {error}</div>}
          {!loading && summary && (
            <div className="ai-summary-content">
              {renderMarkdown(summary)}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
