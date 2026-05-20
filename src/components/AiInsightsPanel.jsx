import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { aiDataQuality, aiAnalyzeUpload, aiCertReuse, aiDetectDuplicates } from '../api/ai'

export default function AiInsightsPanel({ onDismiss }) {
  const [loading, setLoading] = useState(true)
  const [quality, setQuality] = useState(null)
  const [anomalies, setAnomalies] = useState(null)
  const [certs, setCerts] = useState(null)
  const [dupes, setDupes] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [q, a, c, d] = await Promise.allSettled([
          aiDataQuality(),
          aiAnalyzeUpload(),
          aiCertReuse(),
          aiDetectDuplicates(),
        ])
        if (cancelled) return
        if (q.status === 'fulfilled') setQuality(q.value)
        if (a.status === 'fulfilled') setAnomalies(a.value)
        if (c.status === 'fulfilled') setCerts(c.value)
        if (d.status === 'fulfilled') setDupes(d.value)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
      if (!cancelled) setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [])

  const gradeColor = (grade) => {
    if (!grade) return 'var(--text-muted)'
    if (grade === 'A') return '#22c55e'
    if (grade === 'B') return '#86efac'
    if (grade === 'C') return '#fbbf24'
    if (grade === 'D') return '#f97316'
    return '#ef4444'
  }

  const panel = (
    <div className="ai-insights-drawer">
      <div className="ai-insights-panel">
      <div className="ai-insights-header">
        <span className="ai-insights-title">✨ AI Upload Analysis</span>
        <button className="bp-close" onClick={onDismiss}>✕</button>
      </div>

      {loading && (
        <div className="ai-insights-loading">
          <span className="ai-spinner">⟳</span> Analyzing dataset…
        </div>
      )}

      {!loading && error && (
        <div className="ai-insights-error">⚠ {error}</div>
      )}

      {!loading && (
        <div className="ai-insights-body">
          {/* Data Quality Score */}
          {quality && (
            <div className="ai-insight-card">
              <div className="ai-card-header">
                <span>Data Quality</span>
                <span className="ai-quality-badge" style={{ color: gradeColor(quality.grade) }}>
                  {quality.grade} — {quality.score}/100
                </span>
              </div>
              <p className="ai-card-text">{quality.summary}</p>
              {quality.issues?.length > 0 && (
                <ul className="ai-issue-list">
                  {quality.issues.map((issue, i) => (
                    <li key={i} className={`ai-issue ai-issue--${issue.impact}`}>
                      <strong>{issue.column}</strong>: {issue.issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Anomalies */}
          {anomalies?.anomalies?.length > 0 && (
            <div className="ai-insight-card">
              <div className="ai-card-header">
                <span>⚠ Anomalies Detected</span>
                <span className="ai-badge">{anomalies.anomalies.length}</span>
              </div>
              <p className="ai-card-text">{anomalies.summary}</p>
              <ul className="ai-issue-list">
                {anomalies.anomalies.map((a, i) => (
                  <li key={i} className={`ai-issue ai-issue--${a.severity}`}>
                    <strong>{a.column}</strong>: {a.issue}
                    {a.suggestion && <span className="ai-issue-hint"> → {a.suggestion}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Certificate Reuse */}
          {certs?.reused?.length > 0 && (
            <div className="ai-insight-card">
              <div className="ai-card-header">
                <span>🔍 Certificate Re-use</span>
                <span className={`ai-badge ai-badge--${certs.riskLevel}`}>{certs.totalReused} certs</span>
              </div>
              <p className="ai-card-text">{certs.summary}</p>
              {certs.recommendations?.map((r, i) => <p key={i} className="ai-recommendation">→ {r}</p>)}
            </div>
          )}

          {/* Duplicates */}
          {dupes?.clusters?.length > 0 && (
            <div className="ai-insight-card">
              <div className="ai-card-header">
                <span>📋 Duplicate Entries</span>
                <span className={`ai-badge ai-badge--${dupes.riskLevel}`}>{dupes.totalGroups} groups</span>
              </div>
              <p className="ai-card-text">{dupes.summary}</p>
              {dupes.recommendations?.map((r, i) => <p key={i} className="ai-recommendation">→ {r}</p>)}
            </div>
          )}

          {/* All clean */}
          {!anomalies?.anomalies?.length && !certs?.reused?.length && !dupes?.clusters?.length && (
            <div className="ai-insight-card ai-insight-card--clean">
              <span>✓ No anomalies, duplicate entries, or certificate re-use detected.</span>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  )
  return createPortal(panel, document.body)
}
