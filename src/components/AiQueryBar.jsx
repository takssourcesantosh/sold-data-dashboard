import { useState, useRef } from 'react'
import { aiNlQuery } from '../api/ai'

export default function AiQueryBar({ onApplyFilters, onResetFilters, onClose }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const inputRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!query.trim() || loading) return
    setLoading(true)
    setError('')
    setExplanation('')
    try {
      const result = await aiNlQuery(query.trim())
      setExplanation(result.explanation || '')
      onApplyFilters?.(result.filters)
      setApplied(true)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  function handleReset() {
    setQuery('')
    setExplanation('')
    setError('')
    setApplied(false)
    onResetFilters?.()
  }

  return (
    <div className="ai-query-bar">
      <form className="ai-query-form" onSubmit={handleSubmit}>
        <span className="ai-query-icon">✨</span>
        <input
          ref={inputRef}
          className="ai-query-input"
          placeholder="Ask anything… e.g. 'rounds above 2ct with discount over 30%'"
          value={query}
          onChange={e => { setQuery(e.target.value); setApplied(false) }}
          autoFocus
        />
        <button className="btn-primary ai-query-submit" type="submit" disabled={loading || !query.trim()}>
          {loading ? '…' : 'Apply'}
        </button>
        {applied && (
          <button type="button" className="btn ai-reset-btn" onClick={handleReset} title="Clear AI filters">
            ✕ Reset
          </button>
        )}
        <button type="button" className="bp-close" onClick={onClose}>✕</button>
      </form>
      {explanation && <div className="ai-query-explanation">✓ {explanation}</div>}
      {error && <div className="ai-query-error">⚠ {error}</div>}
    </div>
  )
}
