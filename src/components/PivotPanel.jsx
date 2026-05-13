import { useEffect, useState, useMemo } from 'react'
import { pivotApi } from '../api'
import { useToast, useEscClose } from './Toast'

const AGGS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
]

const _fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export default function PivotPanel({ columns, onClose }) {
  const [rowDims, setRowDims] = useState([])
  const [colDim, setColDim] = useState('')
  const [valueCol, setValueCol] = useState('')
  const [agg, setAgg] = useState('sum')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  useEscClose(onClose)

  useEffect(() => {
    if (columns.length && !valueCol) {
      // Guess: first numeric-ish column
      const guess = columns.find(c => /amount|rate|price|total|qty|count/i.test(c)) || columns[0]
      setValueCol(guess)
    }
  }, [columns]) // eslint-disable-line

  async function compute() {
    if (!rowDims.length) return toast.warn('Select at least one row dimension')
    if (!valueCol) return toast.warn('Pick a value column')
    setLoading(true)
    setResult(null)
    try { setResult(await pivotApi({ rowDims, colDim: colDim || null, valueCol, agg })) }
    catch (e) { toast.error(e.message) }
    setLoading(false)
  }

  function toggleRowDim(c) {
    setRowDims(d => d.includes(c) ? d.filter(x => x !== c) : [...d, c])
  }

  // Compute column totals when result has colDim
  const totals = useMemo(() => {
    if (!result?.colDim) return null
    const t = {}
    for (const c of result.cols) t[c] = 0
    for (const r of result.rows) for (const c of result.cols) {
      const v = r.values[c]; if (typeof v === 'number') t[c] += v
    }
    return t
  }, [result])

  return (
    <div className="pp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pivot-panel" role="dialog" aria-modal="true" aria-labelledby="pv-title">
        <div className="pp-header">
          <span id="pv-title" className="pp-title">📊 Pivot Table</span>
          <button className="bp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pivot-config">
          <div className="pv-field">
            <label>Rows (drag dims here)</label>
            <div className="pv-chip-area">
              {rowDims.map(d => (
                <span key={d} className="pv-chip">
                  {d}
                  <button className="pv-chip-x" onClick={() => toggleRowDim(d)}>✕</button>
                </span>
              ))}
              <select value="" onChange={(e) => { if (e.target.value) toggleRowDim(e.target.value); }}>
                <option value="">+ Add dimension…</option>
                {columns.filter(c => !rowDims.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="pv-field">
            <label>Column (optional)</label>
            <select value={colDim} onChange={(e) => setColDim(e.target.value)}>
              <option value="">— None —</option>
              {columns.filter(c => !rowDims.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="pv-field">
            <label>Value</label>
            <select value={valueCol} onChange={(e) => setValueCol(e.target.value)}>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="pv-field">
            <label>Aggregation</label>
            <select value={agg} onChange={(e) => setAgg(e.target.value)}>
              {AGGS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          <button className="btn-primary" onClick={compute} disabled={!valueCol}>Compute</button>
        </div>

        <div className="pivot-result">
          {loading && <div className="vw-empty">Computing…</div>}
          {!loading && result && (
            <div className="pv-table-wrap">
              <table className="pv-table">
                <thead>
                  <tr>
                    {result.rowDims.map(d => <th key={d}>{d}</th>)}
                    {result.colDim
                      ? result.cols.map(c => <th key={c} className="pv-num">{c}</th>)
                      : <th className="pv-num">{agg}({valueCol})</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      {r.keys.map((k, j) => <td key={j}>{String(k ?? '')}</td>)}
                      {result.colDim
                        ? result.cols.map(c => <td key={c} className="pv-num">{r.values[c] == null ? '' : _fmt.format(r.values[c])}</td>)
                        : <td className="pv-num">{r.values._v == null ? '' : _fmt.format(r.values._v)}</td>}
                    </tr>
                  ))}
                  {totals && (
                    <tr className="pv-totals">
                      {result.rowDims.map((d, i) => <td key={i}>{i === 0 ? 'Total' : ''}</td>)}
                      {result.cols.map(c => <td key={c} className="pv-num">{_fmt.format(totals[c])}</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
