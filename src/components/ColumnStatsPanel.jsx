import { useEffect, useState } from 'react'
import { columnStatsApi } from '../api'
import { useEscClose } from './Toast'

const _fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })
const _intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export default function ColumnStatsPanel({ col, onClose }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  useEscClose(onClose)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setStats(null)
    columnStatsApi(col)
      .then(data => { if (!cancelled) { setStats(data); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [col])

  const total = stats?.total ?? 0
  const nullCount = stats?.nullCount ?? 0
  const nullPct = total > 0 ? ((nullCount / total) * 100).toFixed(1) : '0.0'
  const isNumeric = stats?.numMin != null && stats?.numMax != null

  return (
    <div className="cs-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cs-panel" role="dialog" aria-modal="true" aria-labelledby="cs-title">
        <div className="cs-header">
          <span id="cs-title" className="cs-title">Column Stats — <em>{col}</em></span>
          <button className="bp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cs-body">
          {loading && <div className="cs-loading">Loading…</div>}
          {error && <div className="cs-error">Error: {error}</div>}
          {!loading && !error && stats && (
            <table className="cs-table">
              <tbody>
                <tr>
                  <th>Total rows</th>
                  <td>{_intFmt.format(total)}</td>
                </tr>
                <tr>
                  <th>Null / blank</th>
                  <td>{_intFmt.format(nullCount)} ({nullPct}%)</td>
                </tr>
                <tr>
                  <th>Unique values</th>
                  <td>{_intFmt.format(stats.uniqueCount ?? 0)}</td>
                </tr>
                {isNumeric ? (
                  <>
                    <tr className="cs-divider-row"><td colSpan={2}><span>Numeric</span></td></tr>
                    <tr>
                      <th>Min</th>
                      <td>{_fmt.format(stats.numMin)}</td>
                    </tr>
                    <tr>
                      <th>Max</th>
                      <td>{_fmt.format(stats.numMax)}</td>
                    </tr>
                    <tr>
                      <th>Sum</th>
                      <td>{_fmt.format(stats.numSum ?? 0)}</td>
                    </tr>
                    <tr>
                      <th>Average</th>
                      <td>{_fmt.format(stats.numAvg ?? 0)}</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr className="cs-divider-row"><td colSpan={2}><span>Text</span></td></tr>
                    <tr>
                      <th>Min (alpha)</th>
                      <td>{stats.strMin ?? '—'}</td>
                    </tr>
                    <tr>
                      <th>Max (alpha)</th>
                      <td>{stats.strMax ?? '—'}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
