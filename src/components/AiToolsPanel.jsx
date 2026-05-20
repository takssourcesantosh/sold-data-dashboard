import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEscClose } from './Toast'
import {
  aiDetectDuplicates, aiCertReuse, aiSuggestAlerts,
  aiSuggestFormatting, aiForecast, aiBuyerProfile, aiSummary, aiChat
} from '../api/ai'

const TOOLS = [
  {
    id: 'summary',
    icon: '📝',
    label: 'Executive Summary',
    desc: 'AI-generated business summary of your current dataset',
  },
  {
    id: 'duplicates',
    icon: '📋',
    label: 'Detect Duplicates',
    desc: 'Find duplicate diamond entries using key columns',
  },
  {
    id: 'certs',
    icon: '🔍',
    label: 'Certificate Check',
    desc: 'Detect reused or suspicious certificate numbers',
  },
  {
    id: 'alerts',
    icon: '🔔',
    label: 'Alert Ideas',
    desc: 'AI-suggested threshold alerts for your data',
  },
  {
    id: 'formatting',
    icon: '🎨',
    label: 'Format Ideas',
    desc: 'Conditional formatting rules to highlight patterns',
  },
  {
    id: 'forecast',
    icon: '📈',
    label: 'Trend Forecast',
    desc: 'Predict future values based on historical trends',
  },
  {
    id: 'buyer',
    icon: '👤',
    label: 'Buyer Profile',
    desc: 'Analyze purchase patterns for a specific buyer',
  },
]

function useAiCall(fn) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const run = async (...args) => {
    setLoading(true); setError(''); setData(null)
    try { setData(await fn(...args)) } catch (e) { setError(e.message) }
    setLoading(false)
  }
  return { loading, data, error, run }
}

export default function AiToolsPanel({ columns = [], onApplyAlerts, onApplyFormatting, onClose }) {
  const [activeTool, setActiveTool] = useState(null)
  const [cursor, setCursor] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  useEscClose(() => {
    if (chatOpen) { setChatOpen(false); return }
    if (activeTool) { setActiveTool(null); return }
    onClose()
  })

  const summary   = useAiCall(aiSummary)
  const dupes     = useAiCall(aiDetectDuplicates)
  const certs     = useAiCall(aiCertReuse)
  const alerts    = useAiCall(aiSuggestAlerts)
  const formatting = useAiCall(aiSuggestFormatting)
  const [forecastForm, setForecastForm] = useState({ dateCol: '', valueCol: '', agg: 'avg' })
  const forecast  = useAiCall(aiForecast)
  const [buyerForm, setBuyerForm] = useState({ buyerCol: '', buyerValue: '' })
  const buyer     = useAiCall(aiBuyerProfile)

  const dateCols  = columns.filter(c => /date|dt$|^dt|day/i.test(c))
  const numCols   = columns.filter(c => /amount|rate|price|total|qty|count|carat|rap|disc/i.test(c))
  const buyerCols = columns.filter(c => /buyer|client|customer|party|name|company/i.test(c))

  // Keyboard navigation on tool list
  useEffect(() => {
    if (activeTool) return
    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, TOOLS.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
      if (e.key === 'Enter')     { e.preventDefault(); setActiveTool(TOOLS[cursor].id); setCursor(0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool, cursor])

  const activeMeta = TOOLS.find(t => t.id === activeTool)

  return createPortal(
    <div className="atp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="atp-panel" role="dialog" aria-modal="true">

        {/* ── Top nav hints ── */}
        <div className="atp-nav-hints">
          <span className="atp-hint">
            <span className="atp-hint-icon">↑</span>
            <span className="atp-hint-icon">↓</span>
            <span className="atp-hint-label">To Navigate</span>
          </span>
          <span className="atp-hint">
            <span className="atp-hint-icon">↵</span>
            <span className="atp-hint-label">To Select</span>
          </span>
          <span className="atp-hint">
            <span className="atp-hint-icon">✕</span>
            <span className="atp-hint-label">To Close</span>
          </span>
        </div>

        {/* ── Tool list or active tool ── */}
        <div className="atp-body">
          {!activeTool ? (
            <ul className="atp-tool-list">
              {TOOLS.map((t, i) => (
                <li
                  key={t.id}
                  className={`atp-tool-item${cursor === i ? ' atp-tool-item--focused' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => { setActiveTool(t.id) }}
                >
                  <span className="atp-tool-arrow">→</span>
                  <div className="atp-tool-info">
                    <span className="atp-tool-name">{t.icon} {t.label}</span>
                    <span className="atp-tool-desc">{t.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="atp-active-tool">
              <button className="atp-back-btn" onClick={() => setActiveTool(null)}>← Back</button>
              <ToolContent
                id={activeTool}
                summary={summary}
                dupes={dupes} certs={certs} alerts={alerts} formatting={formatting}
                forecast={forecast} forecastForm={forecastForm} setForecastForm={setForecastForm}
                buyer={buyer} buyerForm={buyerForm} setBuyerForm={setBuyerForm}
                dateCols={dateCols} numCols={numCols} buyerCols={buyerCols} columns={columns}
                onApplyAlerts={onApplyAlerts} onApplyFormatting={onApplyFormatting}
              />
            </div>
          )}
        </div>

        {/* ── Chat pane (expandable) ── */}
        {chatOpen
          ? <ChatPane
              context={activeMeta ? activeMeta.label : 'AI Tools'}
              onClose={() => setChatOpen(false)}
            />
          : <div className="atp-footer">
              <span className="atp-footer-context">
                <button className="atp-footer-reload" title="Back to list" onClick={() => setActiveTool(null)}>↺</button>
                ✨ {activeMeta ? `${activeMeta.icon} ${activeMeta.label}` : 'AI Tools'}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="atp-chat-trigger" onClick={() => setChatOpen(true)} title="Ask AI a question">
                  💬 Ask AI
                </button>
                <button className="atp-close-btn" onClick={onClose}>✕</button>
              </div>
            </div>
        }
      </div>
    </div>,
    document.body
  )
}

const SUGGESTIONS = [
  'What are the key insights?',
  'Which vendor has highest sales?',
  'What is the average discount?',
  'Any unusual patterns?',
  'Which shape sells most?',
]

function ChatPane({ context, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Hi! 👋 I'm your AI diamond analyst. Ask me anything about your data or the current analysis.`, ts: new Date() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => { inputRef.current?.focus() }, [])

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    const userMsg = { role: 'user', content: msg, ts: new Date() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const { reply } = await aiChat(msg, context, history)
      setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: new Date() }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠ ${e.message}`, ts: new Date() }])
    }
    setLoading(false)
  }

  function fmt(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="chat-pane">
      {/* header */}
      <div className="chat-header">
        <div className="chat-avatar">✨</div>
        <div className="chat-header-info">
          <span className="chat-name">AI Diamond Analyst</span>
          <span className="chat-status">● Online</span>
        </div>
        <div className="chat-header-actions">
          <button className="chat-action-btn" onClick={() => setMessages([messages[0]])} title="Clear chat">↺</button>
          <button className="chat-action-btn" onClick={onClose} title="Close chat">✕</button>
        </div>
      </div>

      {/* date separator */}
      <div className="chat-date-sep">
        <span>{new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </div>

      {/* messages */}
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            {m.role === 'assistant' && <div className="chat-msg-avatar">✨</div>}
            <div className="chat-msg-body">
              {m.role === 'assistant' && <div className="chat-msg-name">AI Analyst</div>}
              <div className="chat-bubble">{m.content}</div>
              <div className="chat-ts">{fmt(m.ts)}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-msg-avatar">✨</div>
            <div className="chat-msg-body">
              <div className="chat-msg-name">AI Analyst</div>
              <div className="chat-bubble chat-bubble--typing">
                <span className="chat-dot"/><span className="chat-dot"/><span className="chat-dot"/>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* suggestion chips */}
      {messages.length <= 2 && !loading && (
        <div className="chat-chips">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} className="chat-chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      {/* input */}
      <div className="chat-input-bar">
        <input
          ref={inputRef}
          className="chat-input"
          placeholder="Ask a question…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={() => send()}
          disabled={!input.trim() || loading}
          title="Send"
        >↑</button>
      </div>
      <div className="chat-powered">Powered by ✨ AI Tools</div>
    </div>
  )
}

// Inline markdown renderer (bold/italic/paragraphs)
function Markdown({ text }) {
  if (!text) return null
  return text.split(/\n\n+/).map((para, pi) => {
    if (!para.trim()) return null
    const segments = []
    const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
    let last = 0, key = 0, match
    while ((match = regex.exec(para)) !== null) {
      if (match.index > last) segments.push(para.slice(last, match.index))
      if (match[1]) segments.push(<strong key={key++}>{match[1]}</strong>)
      else if (match[2]) segments.push(<em key={key++}>{match[2]}</em>)
      last = match.index + match[0].length
    }
    if (last < para.length) segments.push(para.slice(last))
    return <p key={pi} className="atp-result-text" style={{ marginBottom: 8 }}>{segments}</p>
  })
}

function ToolContent({
  id, summary, dupes, certs, alerts, formatting,
  forecast, forecastForm, setForecastForm,
  buyer, buyerForm, setBuyerForm,
  dateCols, numCols, buyerCols, columns,
  onApplyAlerts, onApplyFormatting
}) {
  if (id === 'summary') return (
    <div className="atp-tool-body">
      <button className="btn-primary ai-run-btn" onClick={summary.run} disabled={summary.loading}>
        {summary.loading ? '⟳ Generating…' : '✨ Generate Summary'}
      </button>
      {summary.error && <p className="atp-error">⚠ {summary.error}</p>}
      {summary.data && (
        <div className="atp-summary-result">
          <Markdown text={summary.data.summary} />
          <button className="btn atp-regen-btn" onClick={summary.run} disabled={summary.loading}>↺ Regenerate</button>
        </div>
      )}
    </div>
  )

  if (id === 'duplicates') return (
    <div className="atp-tool-body">
      <button className="btn-primary ai-run-btn" onClick={dupes.run} disabled={dupes.loading}>
        {dupes.loading ? '⟳ Analyzing…' : '✨ Detect Duplicates'}
      </button>
      {dupes.error && <p className="atp-error">⚠ {dupes.error}</p>}
      {dupes.data && (
        <>
          <p className="atp-result-text">{dupes.data.summary}</p>
          <p className="atp-result-meta"><strong>Risk:</strong> {dupes.data.riskLevel} &nbsp;·&nbsp; <strong>Groups:</strong> {dupes.data.totalGroups}</p>
          {dupes.data.recommendations?.map((r, i) => <p key={i} className="atp-recommendation">→ {r}</p>)}
          {dupes.data.clusters?.length > 0 && (
            <table className="cs-table" style={{ marginTop: 10 }}>
              <thead><tr>{dupes.data.keyColumns?.map(c => <th key={c}>{c}</th>)}<th>Count</th></tr></thead>
              <tbody>{dupes.data.clusters.slice(0, 20).map((row, i) => (
                <tr key={i}>
                  {dupes.data.keyColumns?.map(c => <td key={c}>{row[c]}</td>)}
                  <td>{row.cnt}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </div>
  )

  if (id === 'certs') return (
    <div className="atp-tool-body">
      <button className="btn-primary ai-run-btn" onClick={certs.run} disabled={certs.loading}>
        {certs.loading ? '⟳ Checking…' : '✨ Check Certificates'}
      </button>
      {certs.error && <p className="atp-error">⚠ {certs.error}</p>}
      {certs.data && (
        <>
          {certs.data.certColumn && <p className="atp-result-meta"><strong>Cert column:</strong> {certs.data.certColumn}</p>}
          <p className="atp-result-text">{certs.data.summary}</p>
          {certs.data.riskLevel && <p className="atp-result-meta"><strong>Risk:</strong> {certs.data.riskLevel} &nbsp;·&nbsp; <strong>Reused:</strong> {certs.data.totalReused}</p>}
          {certs.data.recommendations?.map((r, i) => <p key={i} className="atp-recommendation">→ {r}</p>)}
        </>
      )}
    </div>
  )

  if (id === 'alerts') return (
    <div className="atp-tool-body">
      <button className="btn-primary ai-run-btn" onClick={alerts.run} disabled={alerts.loading}>
        {alerts.loading ? '⟳ Thinking…' : '✨ Suggest Alerts'}
      </button>
      {alerts.error && <p className="atp-error">⚠ {alerts.error}</p>}
      {alerts.data?.suggestions?.map((s, i) => (
        <div key={i} className="atp-card">
          <div className="atp-card-header">
            <strong>{s.name}</strong>
            {onApplyAlerts && <button className="btn atp-apply-btn" onClick={() => onApplyAlerts(s)}>+ Add</button>}
          </div>
          <div className="atp-card-meta">{s.column_name} {s.op} {s.threshold}</div>
          <div className="atp-card-text">{s.reason}</div>
        </div>
      ))}
    </div>
  )

  if (id === 'formatting') return (
    <div className="atp-tool-body">
      <button className="btn-primary ai-run-btn" onClick={formatting.run} disabled={formatting.loading}>
        {formatting.loading ? '⟳ Thinking…' : '✨ Suggest Formatting'}
      </button>
      {formatting.error && <p className="atp-error">⚠ {formatting.error}</p>}
      {formatting.data?.rules?.map((r, i) => (
        <div key={i} className="atp-card">
          <div className="atp-card-header">
            <strong>{r.column_name}</strong>
            <span className="atp-badge">{r.rule?.kind}</span>
            {onApplyFormatting && <button className="btn atp-apply-btn" onClick={() => onApplyFormatting(r)}>+ Apply</button>}
          </div>
          <div className="atp-card-text">{r.reason}</div>
        </div>
      ))}
    </div>
  )

  if (id === 'forecast') return (
    <div className="atp-tool-body">
      <div className="atp-form-row">
        <label>Date column</label>
        <select value={forecastForm.dateCol} onChange={e => setForecastForm(f => ({ ...f, dateCol: e.target.value }))}>
          <option value="">Select…</option>
          {(dateCols.length ? dateCols : columns).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="atp-form-row">
        <label>Value column</label>
        <select value={forecastForm.valueCol} onChange={e => setForecastForm(f => ({ ...f, valueCol: e.target.value }))}>
          <option value="">Select…</option>
          {(numCols.length ? numCols : columns).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="atp-form-row">
        <label>Aggregation</label>
        <select value={forecastForm.agg} onChange={e => setForecastForm(f => ({ ...f, agg: e.target.value }))}>
          <option value="sum">Sum</option>
          <option value="avg">Average</option>
          <option value="count">Count</option>
        </select>
      </div>
      <button className="btn-primary ai-run-btn"
        disabled={!forecastForm.dateCol || !forecastForm.valueCol || forecast.loading}
        onClick={() => forecast.run(forecastForm.dateCol, forecastForm.valueCol, forecastForm.agg)}>
        {forecast.loading ? '⟳ Forecasting…' : '✨ Generate Forecast'}
      </button>
      {forecast.error && <p className="atp-error">⚠ {forecast.error}</p>}
      {forecast.data && (
        <>
          <p className="atp-result-meta"><strong>Trend:</strong> {forecast.data.trend}</p>
          <p className="atp-result-text">{forecast.data.narrative}</p>
          {forecast.data.seasonality && <p className="atp-result-text"><em>{forecast.data.seasonality}</em></p>}
          {forecast.data.forecast?.length > 0 && (
            <table className="cs-table" style={{ marginTop: 10 }}>
              <thead><tr><th>Period</th><th>Forecast</th><th>Confidence</th></tr></thead>
              <tbody>{forecast.data.forecast.map((f, i) => (
                <tr key={i}>
                  <td>{f.period}</td>
                  <td>{typeof f.value === 'number' ? f.value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : f.value}</td>
                  <td>{f.confidence}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </div>
  )

  if (id === 'buyer') return (
    <div className="atp-tool-body">
      <div className="atp-form-row">
        <label>Buyer column</label>
        <select value={buyerForm.buyerCol} onChange={e => setBuyerForm(f => ({ ...f, buyerCol: e.target.value }))}>
          <option value="">Select…</option>
          {(buyerCols.length ? buyerCols : columns).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="atp-form-row">
        <label>Buyer value</label>
        <input className="atp-text-input" placeholder="e.g. Acme Diamonds"
          value={buyerForm.buyerValue} onChange={e => setBuyerForm(f => ({ ...f, buyerValue: e.target.value }))} />
      </div>
      <button className="btn-primary ai-run-btn"
        disabled={!buyerForm.buyerCol || !buyerForm.buyerValue || buyer.loading}
        onClick={() => buyer.run(buyerForm.buyerCol, buyerForm.buyerValue)}>
        {buyer.loading ? '⟳ Analyzing…' : '✨ Generate Profile'}
      </button>
      {buyer.error && <p className="atp-error">⚠ {buyer.error}</p>}
      {buyer.data && (
        <>
          <p className="atp-result-text">{buyer.data.profile}</p>
          <p className="atp-result-meta"><strong>Total purchases:</strong> {buyer.data.stats?.total}</p>
        </>
      )}
    </div>
  )

  return null
}
